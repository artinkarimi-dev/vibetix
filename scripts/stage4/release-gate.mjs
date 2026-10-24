import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, stat, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourcePolicyIssues, validateRaceEvidence } from './policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const evidenceDir = resolve(root, 'artifacts/stage3');
const destination = resolve(root, 'artifacts/stage4');
const live = process.argv.includes('--live');
const concurrency = Number(process.env.STAGE4_CONCURRENCY ?? 24);
const report = {
  version: 1,
  stage: 4,
  scope: 'Portfolio release candidate; NOT a commercial ticketing production certification',
  startedAt: new Date().toISOString(),
  gitRevision: process.env.GITHUB_SHA ?? null,
  hostNode: process.version,
  checks: [],
  liveHttpPostgresVerified: false,
  publicDeploymentVerified: false,
  outcome: 'blocked',
};
let interrupted = false;
let activeChild;
for (const name of ['SIGINT', 'SIGTERM']) process.once(name, () => {
  interrupted = true;
  activeChild?.kill('SIGTERM');
});
const add = (name, ok, detail = '') => { report.checks.push({ name, result: ok ? 'pass' : 'fail', detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`); };
async function run(name, file, args, env = process.env) {
  const start = Date.now();
  console.log(`RUN ${name}`);
  const child = spawn(file, args, { cwd: root, env, stdio: 'inherit' });
  activeChild = child;
  const status = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ error: error.message }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  activeChild = null;
  const good = status.code === 0 && !interrupted;
  add(name, good, good ? `${Date.now() - start}ms` : (status.error ?? `exit=${status.code ?? status.signal}`));
  return good;
}
async function listEvidence() {
  try { return (await readdir(evidenceDir)).filter((name) => /^verified-[0-9a-f-]+\.json$/.test(name)); }
  catch { return []; }
}
async function verifyFreshEvidence(before, beganAt) {
  const added = (await listEvidence()).filter((name) => !before.has(name));
  if (added.length !== 1) throw new Error(`Expected one NEW Stage 3 verified report; found ${added.length}`);
  const file = resolve(evidenceDir, added[0]);
  const stats = await stat(file);
  if (stats.mtimeMs < beganAt - 3000) throw new Error('Stale report timestamp; refusing a recycled pass');
  const bytes = await readFile(file);
  const payload = JSON.parse(bytes.toString('utf8'));
  const problems = validateRaceEvidence(payload, { minConcurrency: concurrency });
  if (problems.length) throw new Error(`Reported live results are invalid: ${problems.join('; ')}`);
  const timestamp = Date.parse(payload.timestamp);
  if (!Number.isFinite(timestamp) || timestamp < beganAt - 30000 || timestamp > Date.now() + 30000) throw new Error('Reported benchmark timestamp outside this live invocation');
  report.liveEvidence = {
    path: `artifacts/stage3/${added[0]}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    runId: payload.runId,
    composeProject: payload.composeProject,
    timestamp: payload.timestamp,
    concurrency: payload.metrics.concurrencyLimit,
    peakInFlight: payload.metrics.peakInFlight,
    totalRequests: payload.metrics.totalRequests,
    accepted: payload.holds.wins,
    rejected: payload.holds.conflicts,
    unexpected: payload.holds.unexpected,
    p50Ms: payload.metrics.latencyMs.p50,
    p95Ms: payload.metrics.latencyMs.p95,
    p99Ms: payload.metrics.latencyMs.p99,
    requestsPerSecond: payload.metrics.requestsPerSecond,
    payment: 'simulated',
    database: payload.database,
  };
  report.liveHttpPostgresVerified = true;
}
async function finish() {
  report.completedAt = new Date().toISOString();
  report.outcome = interrupted || report.checks.some((x) => x.result !== 'pass') || (live && !report.liveHttpPostgresVerified) ? 'blocked' : live ? 'live-benchmark-verified' : 'static-checks-passed';
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const text = JSON.stringify(report, null, 2) + '\n';
  const target = resolve(destination, 'release-gate.json');
  await writeFile(`${target}.tmp`, text, { mode: 0o600 });
  await rename(`${target}.tmp`, target);
  const notes = [
    '# VIBETIX Stage 4 release gate',
    '',
    `- Run: ${report.startedAt}`,
    `- Result: **${report.outcome}**`,
    `- Live HTTP + PostgreSQL verified in THIS run: **${report.liveHttpPostgresVerified ? 'YES' : 'NO'}**`,
    '- Public internet HTTPS, real payments, multi-node capacity and commercial production readiness: **NOT VERIFIED**',
    '',
    '## Checks',
    ...report.checks.map((x) => `- ${x.result.toUpperCase()}: ${x.name}${x.detail ? ` — ${x.detail}` : ''}`),
    '',
    ...(report.liveEvidence ? [ '## Live evidence', '', `- SHA-256 of raw evidence: \`${report.liveEvidence.sha256}\``, `- Results: ${report.liveEvidence.accepted} accepted / ${report.liveEvidence.rejected} conflicted / ${report.liveEvidence.unexpected} unexpected`, `- Concurrency limit: ${report.liveEvidence.concurrency}; measured peak in flight: ${report.liveEvidence.peakInFlight}`, `- p95: ${report.liveEvidence.p95Ms} ms; ${report.liveEvidence.requestsPerSecond} req/s`, `- Details: \`${report.liveEvidence.path}\``, '' ] : [ '## Live evidence', '', 'No actual Docker/PostgreSQL HTTP benchmark was verified in this run.', '' ]),
  ];
  await writeFile(resolve(destination, 'release-gate.md'), notes.join('\n'), { mode: 0o600 });
  console.log(`Stage 4: ${report.outcome}. Machine report: artifacts/stage4/release-gate.json`);
  if (report.outcome === 'blocked') process.exitCode = 1;
}
try {
  const issues = await sourcePolicyIssues(root);
  add('Static deployment and CI policy', issues.length === 0, issues.length ? issues.join('; ') : 'production Docker/HTTPS/CI guardrails present');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 1000) add('Concurrency parameter', false, 'STAGE4_CONCURRENCY must be an integer in 1..1000');
  else add('Concurrency parameter', true, `in-flight limit ${concurrency} (1000 total requests)`);
  if (!report.checks.some((x) => x.result === 'fail')) {
    const tests = ['scripts/tests/stage1-smoke.test.mjs', 'scripts/tests/stage2-core.test.mjs', 'scripts/tests/stage3-core.test.mjs', 'scripts/tests/stage3-studio.test.mjs', 'scripts/tests/stage4-policy.test.mjs', 'showcase/engine.test.mjs', 'showcase/server.test.mjs'];
    const passed = await run('Stage 1-4 and showcase test regressions', process.execPath, ['--test', ...tests]);
    if (passed && live) {
      const before = new Set(await listEvidence());
      const beganAt = Date.now();
      const livePassed = await run('Live Stage 1, Stage 2, Stage 3 (Docker, 1000 HTTP, PostgreSQL)', process.execPath, ['scripts/stage3-all.mjs'], { ...process.env, STAGE3_CONCURRENCY: String(concurrency) });
      if (livePassed) {
        try { await verifyFreshEvidence(before, beganAt); add('Fresh immutable-hash evidence and PostgreSQL invariants', true, 'new report verified'); }
        catch (error) { add('Fresh immutable-hash evidence and PostgreSQL invariants', false, error.message); }
      }
    }
  }
} catch (error) { add('Unexpected release-gate exception', false, error.message); }
finally { await finish(); }
