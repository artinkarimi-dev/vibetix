import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { deploymentIssues, domainIssues, inspectDeploymentFiles, renderHttpsTemplate, sourcePolicyIssues, tlsMaterialIssues, validateRaceEvidence } from '../stage4/policy.mjs';

const validEvidence = () => ({
  passed: true, verification: 'Local isolated Docker / actual HTTP / PostgreSQL', composeProject: 'vibetix-s3-012345abcd', runId: 'test-uuid-012345', payment: 'simulated, no real money',
  holds: { wins: 10, conflicts: 990, unexpected: 0 },
  metrics: { totalRequests: 1000, peakInFlight: 24, concurrencyLimit: 24, elapsedMs: 5000, requestsPerSecond: 200, byStatus: { 200: 10, 409: 990 }, latencyMs: { p50: 5, p95: 10, p99: 15, max: 30 } },
  database: { soldSeats: 10, finalHolds: 0, orderCount: 10, itemCount: 10, ticketCount: 10, paymentCount: 10 },
  orders: Array.from({ length: 10 }, (_, i) => ({ id: `order-${i}` })),
});

test('Stage 4 requires actual isolated Docker + real HTTP + PostgreSQL provenance', () => {
  assert.deepEqual(validateRaceEvidence(validEvidence(), { minConcurrency: 24 }), []);
  for (const [path, value] of [
    [['verification'], 'Mock HTTP'], [['composeProject'], 'other'], [['holds', 'wins'], 11], [['holds', 'unexpected'], 1],
    [['metrics', 'totalRequests'], 999], [['metrics', 'byStatus', '429'], 1], [['database', 'soldSeats'], 11],
    [['database', 'ticketCount'], 9], [['metrics', 'latencyMs', 'p95'], -1], [['payment'], 'real money'],
  ]) {
    const altered = structuredClone(validEvidence());
    let obj = altered;
    for (const key of path.slice(0, -1)) obj = obj[key];
    obj[path.at(-1)] = value;
    assert.ok(validateRaceEvidence(altered).length > 0, `accepted fabricated ${path.join('.')}`);
  }
  const duplicate = validEvidence(); duplicate.orders[1].id = duplicate.orders[0].id;
  assert.ok(validateRaceEvidence(duplicate).length > 0);
  assert.ok(validateRaceEvidence(validEvidence(), { minConcurrency: 100 }).length > 0);
});

test('Stage 4 public TLS vhost renderer denies injection, placeholders and invalid names', async () => {
  const template = await readFile(resolve('frontend/https.conf.example'), 'utf8');
  assert.equal(domainIssues('tickets.company.ir').length, 0);
  for (const value of ['localhost', 'tickets.example.invalid', 'hello.test', 'foo.com; return 200 hacked;', 'a..com', 'UPPER.com', 'evil.com\nallow all', '-test.example.com']) {
    assert.ok(domainIssues(value).length, `Domain accepted: ${value}`);
    assert.throws(() => renderHttpsTemplate(template, value));
  }
  const conf = renderHttpsTemplate(template, 'tickets.company.ir');
  assert.ok(conf.includes('server_name tickets.company.ir;'));
  assert.ok(!conf.includes('tickets.example.invalid'));
  assert.equal((conf.match(/tickets\.company\.ir/g) ?? []).length, 3);
});

test('Stage 4 public deployment preflight is fail-closed and requires pinned images + restricted secret paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vibetix-s4-'));
  try {
    const entries = ['DATABASE_URL_SECRET_FILE', 'REDIS_URL_SECRET_FILE', 'TICKET_KEY_SECRET_FILE', 'ABUSE_KEY_SECRET_FILE', 'TLS_CERTIFICATE_FILE', 'TLS_PRIVATE_KEY_FILE', 'NGINX_HTTPS_CONFIG_FILE'];
    const env = { VIBETIX_DOMAIN: 'tickets.company.ir', APP_ORIGIN: 'https://tickets.company.ir', ALLOW_SIMULATED_PAYMENTS: 'false', APP_MODE: 'portfolio', VIBETIX_BACKEND_IMAGE: `registry.test/vibetix-api@sha256:${'a'.repeat(64)}`, VIBETIX_FRONTEND_IMAGE: `registry.test/vibetix-web@sha256:${'b'.repeat(64)}` };
    for (const name of entries) {
      env[name] = join(root, name);
      await writeFile(env[name], name === 'NGINX_HTTPS_CONFIG_FILE' ? 'server_name tickets.company.ir;\nlisten 8443 ssl;\nssl_certificate /run/secrets/tls_certificate;\n' : 'fictional fake data\n', { mode: 0o600 });
    }
    assert.deepEqual(deploymentIssues(env), []);
    assert.deepEqual(await inspectDeploymentFiles(env), []);
    await chmod(env.TICKET_KEY_SECRET_FILE, 0o644);
    assert.ok((await inspectDeploymentFiles(env)).some((x) => x.includes('TICKET_KEY')));
    await chmod(env.TICKET_KEY_SECRET_FILE, 0o600);
    assert.ok(deploymentIssues({ ...env, APP_ORIGIN: 'http://tickets.company.ir', ALLOW_SIMULATED_PAYMENTS: 'true' }).length >= 2);
    assert.ok(deploymentIssues({ ...env, VIBETIX_BACKEND_IMAGE: 'vibetix-api:latest' }).length > 0);
    assert.ok(deploymentIssues({ ...env, DATABASE_URL: 'intentionally-unacceptable-inline-secret' }).length > 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Stage 4 source deployment policy exists and is internally consistent', async () => {
  assert.deepEqual(await sourcePolicyIssues(resolve('.')), []);
});

test('Stage 4 rejects missing, expired and mismatched TLS certificate material', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vibetix-tls-'));
  try {
    const certificate = join(root, 'certificate.pem');
    const privateKey = join(root, 'key.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate, '-days', '30', '-subj', '/CN=tickets.company.ir', '-addext', 'subjectAltName=DNS:tickets.company.ir'], { stdio: 'ignore' });
    assert.deepEqual(tlsMaterialIssues({ VIBETIX_DOMAIN: 'tickets.company.ir', TLS_CERTIFICATE_FILE: certificate, TLS_PRIVATE_KEY_FILE: privateKey }), []);
    // CN-only certificates can misleadingly pass legacy hostname checks, but
    // browsers require a DNS SAN for a valid public HTTPS endpoint.
    const cnOnlyCert = join(root, 'cn-only.pem');
    const cnOnlyKey = join(root, 'cn-only-key.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', cnOnlyKey, '-out', cnOnlyCert, '-days', '30', '-subj', '/CN=tickets.company.ir'], { stdio: 'ignore' });
    assert.ok(tlsMaterialIssues({ VIBETIX_DOMAIN: 'tickets.company.ir', TLS_CERTIFICATE_FILE: cnOnlyCert, TLS_PRIVATE_KEY_FILE: cnOnlyKey }).some((issue) => issue.includes('Subject Alternative Name')));

    assert.ok(tlsMaterialIssues({ VIBETIX_DOMAIN: 'other.company.ir', TLS_CERTIFICATE_FILE: certificate, TLS_PRIVATE_KEY_FILE: privateKey }).length > 0);
    assert.ok(tlsMaterialIssues({ VIBETIX_DOMAIN: 'other.company.ir', TLS_CERTIFICATE_FILE: certificate, TLS_PRIVATE_KEY_FILE: privateKey }).some((issue) => issue.includes('does not match VIBETIX_DOMAIN')));
    // A valid key pair does not make an unrelated hostname acceptable.
    const differentSanCert = join(root, 'different-san.pem');
    const differentSanKey = join(root, 'different-san-key.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', differentSanKey, '-out', differentSanCert, '-days', '30', '-subj', '/CN=tickets.company.ir', '-addext', 'subjectAltName=DNS:other.company.ir'], { stdio: 'ignore' });
    assert.ok(tlsMaterialIssues({ VIBETIX_DOMAIN: 'tickets.company.ir', TLS_CERTIFICATE_FILE: differentSanCert, TLS_PRIVATE_KEY_FILE: differentSanKey }).some((issue) => issue.includes('does not match VIBETIX_DOMAIN')));
    const otherKey = join(root, 'other.pem');
    execFileSync('openssl', ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', otherKey], { stdio: 'ignore' });
    assert.ok(tlsMaterialIssues({ VIBETIX_DOMAIN: 'tickets.company.ir', TLS_CERTIFICATE_FILE: certificate, TLS_PRIVATE_KEY_FILE: otherKey }).some((issue) => issue.includes('do not match')));
    assert.ok(tlsMaterialIssues({ VIBETIX_DOMAIN: 'tickets.company.ir', TLS_CERTIFICATE_FILE: join(root, 'missing'), TLS_PRIVATE_KEY_FILE: privateKey }).length > 0);
    const nearlyExpiredCert = join(root, 'near-expiry.pem');
    const nearlyExpiredKey = join(root, 'near-expiry-key.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', nearlyExpiredKey, '-out', nearlyExpiredCert, '-days', '1', '-subj', '/CN=tickets.company.ir', '-addext', 'subjectAltName=DNS:tickets.company.ir'], { stdio: 'ignore' });
    assert.ok(tlsMaterialIssues({ VIBETIX_DOMAIN: 'tickets.company.ir', TLS_CERTIFICATE_FILE: nearlyExpiredCert, TLS_PRIVATE_KEY_FILE: nearlyExpiredKey }).some((issue) => issue.includes('expires within 14 days')));
  } finally { await rm(root, { recursive: true, force: true }); }
});
