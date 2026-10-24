import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';

export const expectedDatabase = Object.freeze({
  soldSeats: 10,
  finalHolds: 0,
  orderCount: 10,
  itemCount: 10,
  ticketCount: 10,
  paymentCount: 10,
});

export function validateRaceEvidence(report, { minConcurrency = 1 } = {}) {
  const issues = [];
  const reject = (condition, reason) => { if (!condition) issues.push(reason); };
  reject(report && typeof report === 'object' && !Array.isArray(report), 'Report must be an object');
  if (!report || typeof report !== 'object') return issues;
  reject(report.passed === true, 'The benchmark did not pass');
  reject(report.verification === 'Local isolated Docker / actual HTTP / PostgreSQL', 'Missing approved live verification provenance');
  reject(/^vibetix-s3-[0-9a-f]{10}$/.test(report.composeProject ?? ''), 'Missing isolated Compose project ID');
  reject(typeof report.runId === 'string' && report.runId.length >= 8, 'Missing benchmark run identifier');
  reject(report.holds?.wins === 10 && report.holds?.conflicts === 990 && report.holds?.unexpected === 0, 'Hold result invariant failed');
  reject(report.metrics?.totalRequests === 1000, 'HTTP attempt count is not 1,000');
  reject(Number.isInteger(report.metrics?.peakInFlight) && report.metrics.peakInFlight >= 1, 'Missing measured concurrent requests');
  reject(Number.isInteger(report.metrics?.concurrencyLimit) && report.metrics.concurrencyLimit >= minConcurrency && report.metrics.concurrencyLimit <= 1000, 'Concurrency below requested minimum');
  reject(report.metrics?.peakInFlight <= report.metrics?.concurrencyLimit, 'Peak concurrency exceeded configured limit');
  reject(report.metrics?.byStatus?.['200'] === 10 && report.metrics?.byStatus?.['409'] === 990 && Object.values(report.metrics?.byStatus ?? {}).reduce((a,b) => a + b, 0) === 1000, 'Unexpected HTTP response status');
  reject(Number.isFinite(report.metrics?.elapsedMs) && report.metrics.elapsedMs > 0 && Number.isFinite(report.metrics?.requestsPerSecond) && report.metrics.requestsPerSecond > 0, 'Throughput measurements invalid');
  const latency = report.metrics?.latencyMs;
  reject(latency && [latency.p50, latency.p95, latency.p99, latency.max].every((v) => Number.isFinite(v) && v >= 0) && latency.p50 <= latency.p95 && latency.p95 <= latency.p99 && latency.p99 <= latency.max, 'Latency percentiles invalid');
  for (const [key, value] of Object.entries(expectedDatabase)) reject(report.database?.[key] === value, `PostgreSQL invariant mismatch: ${key}`);
  reject(report.payment === 'simulated, no real money', 'Payment simulation must be explicit');
  reject(Array.isArray(report.orders) && report.orders.length === 10 && new Set(report.orders.map((x) => x.id)).size === 10, '10 unique persisted order identities required');
  return issues;
}

const allowDomain = /^(?=.{1,253}$)(?!-)[a-z0-9-]+(?:\.(?!-)[a-z0-9-]+)+$/;
export function domainIssues(domain) {
  if (typeof domain !== 'string' || !allowDomain.test(domain) || domain.endsWith('.invalid') || domain.endsWith('.example') || domain.endsWith('.test') || domain.endsWith('.localhost') || domain === 'localhost' || domain.startsWith('127.') || domain.includes('..')) return ['A valid owned public DNS name is required'];
  if (domain.split('.').some((label) => label.length > 63 || label.endsWith('-'))) return ['Invalid DNS label'];
  return [];
}
export function renderHttpsTemplate(template, domain) {
  const issues = domainIssues(domain);
  if (issues.length) throw new Error(issues.join('; '));
  if (!template.includes('tickets.example.invalid')) throw new Error('HTTPS template placeholder missing: refusing unreviewed rendering');
  const rendered = template.replaceAll('tickets.example.invalid', domain);
  if (rendered.includes('tickets.example.invalid') || !rendered.includes(`server_name ${domain};`)) throw new Error('Failed to render HTTPS vhost');
  return rendered;
}

export function deploymentIssues(env, { checkFiles = true } = {}) {
  const issues = [];
  const imagePattern = /^[a-z0-9][a-z0-9._:/-]+@sha256:[a-f0-9]{64}$/i;
  const domain = env.VIBETIX_DOMAIN;
  issues.push(...domainIssues(domain));
  if (env.APP_ORIGIN !== `https://${domain}`) issues.push('APP_ORIGIN must exactly match https://VIBETIX_DOMAIN');
  if (env.ALLOW_SIMULATED_PAYMENTS !== 'false') issues.push('Public deployment may not enable simulated payments');
  if (env.APP_MODE !== 'portfolio') issues.push('For this portfolio demo, APP_MODE must be portfolio');
  for (const name of ['VIBETIX_BACKEND_IMAGE', 'VIBETIX_FRONTEND_IMAGE']) {
    if (!imagePattern.test(env[name] ?? '')) issues.push(`${name} must be an immutable sha256 image reference`);
  }
  const files = ['DATABASE_URL_SECRET_FILE', 'REDIS_URL_SECRET_FILE', 'TICKET_KEY_SECRET_FILE', 'ABUSE_KEY_SECRET_FILE', 'TLS_CERTIFICATE_FILE', 'TLS_PRIVATE_KEY_FILE', 'NGINX_HTTPS_CONFIG_FILE'];
  for (const name of files) {
    const path = env[name];
    if (typeof path !== 'string' || !isAbsolute(path)) issues.push(`${name} must be an absolute file path`);
    else if (checkFiles) { /* Presence/permissions checked asynchronously in inspectDeploymentFiles. */ }
  }
  if (['DATABASE_URL', 'REDIS_URL', 'TICKET_SIGNING_KEY', 'ABUSE_KEY_SECRET'].some((name) => env[name])) issues.push('Supply credentials with secret files, not direct environment variables');
  if (env.RATE_LIMIT_BACKEND && env.RATE_LIMIT_BACKEND !== 'redis') issues.push('Shared Redis rate limiting is required');
  return issues;
}

export async function inspectDeploymentFiles(env) {
  const issues = [];
  const paths = ['DATABASE_URL_SECRET_FILE', 'REDIS_URL_SECRET_FILE', 'TICKET_KEY_SECRET_FILE', 'ABUSE_KEY_SECRET_FILE', 'TLS_CERTIFICATE_FILE', 'TLS_PRIVATE_KEY_FILE', 'NGINX_HTTPS_CONFIG_FILE'];
  for (const name of paths) {
    const path = env[name];
    if (typeof path !== 'string' || !isAbsolute(path)) continue;
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size < 4) issues.push(`${name} is empty or not a file`);
      if (['TLS_PRIVATE_KEY_FILE', 'TICKET_KEY_SECRET_FILE', 'ABUSE_KEY_SECRET_FILE', 'DATABASE_URL_SECRET_FILE', 'REDIS_URL_SECRET_FILE'].includes(name) && (info.mode & 0o077) !== 0) issues.push(`${name} is group/world accessible; use chmod 600`);
      if (name === 'NGINX_HTTPS_CONFIG_FILE') {
        const conf = await readFile(path, 'utf8');
        if (conf.includes('tickets.example.invalid') || !conf.includes(`server_name ${env.VIBETIX_DOMAIN};`) || !conf.includes('ssl_certificate /run/secrets/tls_certificate;') || !conf.includes('listen 8443 ssl;')) issues.push('HTTPS config does not match the reviewed domain and TLS mount');
      }
    } catch { issues.push(`${name} could not be read; required deployment input is missing`); }
  }
  return issues;
}

export async function sourcePolicyIssues(root) {
  const read = (p) => readFile(resolve(root, p), 'utf8');
  const issues = [];
  const compose = await read('deploy/compose.production.yml');
  const dockerignore = await read('.dockerignore');
  const backend = await read('backend/Dockerfile');
  const frontend = await read('frontend/Dockerfile');
  const workflow = await read('.github/workflows/stage4-release.yml');
  const tls = await read('frontend/https.conf.example');
  const conditions = [
    [compose.includes('NGINX_HTTPS_CONFIG_FILE:?') && !compose.includes('../frontend/https.conf.example:'), 'Production must use an explicit, reviewed HTTPS configuration'],
    [compose.includes('ALLOW_SIMULATED_PAYMENTS: \'false\'') && compose.includes('read_only: true'), 'Production simulated-payments and read-only filesystem policy missing'],
    [compose.includes('RATE_LIMIT_BACKEND: redis') && compose.includes('TRUSTED_PROXY_CIDRS:'), 'Production proxy and shared rate-limit controls missing'],
    [compose.includes('cap_drop: [ALL]') && compose.includes('no-new-privileges:true'), 'Container capability policy missing'],
    [!compose.includes('build:'), 'Production must consume reviewed immutable images, not build inline'],
    [dockerignore.includes('**/.env') && dockerignore.includes('**/*.key') && dockerignore.includes('.git'), 'Docker context may contain sensitive files'],
    [backend.includes('USER node') && frontend.includes('USER nginx'), 'Application images must run without root'],
    [tls.includes('ssl_protocols TLSv1.2 TLSv1.3') && tls.includes('Strict-Transport-Security'), 'HTTPS template lacks basic transport policy'],
    [/permissions:\s*\n\s*contents: read/.test(workflow), 'Stage 4 CI token must be read-only'],
    [!workflow.includes('pull_request_target:') && !workflow.includes('secrets.'), 'Stage 4 CI must not execute untrusted code with repository secrets'],
    [workflow.includes('stage4:verify') && workflow.includes('stage4:check'), 'CI must execute both static and live release gates'],
  ];
  for (const [ok, message] of conditions) if (!ok) issues.push(message);
  for (const match of workflow.matchAll(/uses:\s*([^\s#]+)/g)) if (!/@[a-f\d]{40}$/.test(match[1])) issues.push(`GitHub action not pinned: ${match[1].split('@')[0]}`);
  return issues;
}

// Validate certificate identity using Node's X.509 parser rather than relying on
// OpenSSL -checkhost exit status, which differs across installed versions.
// This validates local material only; it is not a public CA trust-chain check.
export function tlsMaterialIssues(env) {
  const issues = [];
  const certificateFile = env.TLS_CERTIFICATE_FILE;
  const privateKeyFile = env.TLS_PRIVATE_KEY_FILE;
  if (typeof certificateFile !== 'string' || typeof privateKeyFile !== 'string') {
    return ['Certificate and key files are required'];
  }

  let certificate;
  try {
    certificate = new X509Certificate(readFileSync(certificateFile));
    const validFrom = Date.parse(certificate.validFrom);
    const validTo = Date.parse(certificate.validTo);
    const minimumValidity = Date.now() + 14 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(validFrom) || !Number.isFinite(validTo) || validFrom > Date.now() || validTo <= minimumValidity) {
      issues.push('Certificate is not yet valid, has expired or expires within 14 days');
    }
    // Public HTTPS clients require a DNS Subject Alternative Name (SAN).
    if (!certificate.subjectAltName?.includes('DNS:')) {
      issues.push('TLS certificate must contain a DNS Subject Alternative Name (SAN)');
    }
    if (domainIssues(env.VIBETIX_DOMAIN).length || !certificate.checkHost(env.VIBETIX_DOMAIN)) {
      issues.push('TLS certificate does not match VIBETIX_DOMAIN');
    }
  } catch {
    issues.push('Cannot read or parse TLS certificate');
  }

  if (certificate) {
    try {
      const certificatePublic = certificate.publicKey.export({ type: 'spki', format: 'der' });
      const privateKey = createPrivateKey(readFileSync(privateKeyFile));
      const keyPublic = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
      if (!certificatePublic.equals(keyPublic)) {
        issues.push('TLS certificate and private key do not match');
      }
    } catch {
      issues.push('Cannot read or verify TLS private key');
    }
  } else {
    // A missing/broken certificate must never result in a passing preflight.
    // Do not attempt to log private-key contents.
    try { createPrivateKey(readFileSync(privateKeyFile)); }
    catch { issues.push('Cannot read or verify TLS private key'); }
  }
  return issues;
}
