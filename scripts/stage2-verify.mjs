import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const project = `vibetix-s2-${randomBytes(5).toString('hex')}`;
const compose = ['compose', '-p', project, '--env-file', '.env.local', '-f', 'docker-compose.yml', '-f', 'docker-compose.stage2.yml'];
const concurrency = Number(process.env.STAGE2_CONCURRENCY ?? 24);
const commands = [];
const run = (command, args, options = {}) => {
  commands.push(`${command} ${args.join(' ')}`);
  const outcome = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  if (outcome.stderr) process.stderr.write(outcome.stderr);
  if (outcome.error) throw new Error(`${command}: ${outcome.error.message}`);
  if (outcome.status !== 0) throw new Error(`Command failed with exit code ${outcome.status}: ${command} ${args.slice(0, 6).join(' ')}`);
  return outcome.stdout ?? '';
};
const safeLocalEnv = () => {
  if (!existsSync('.env.local')) throw new Error('Local credentials missing. First run npm run stage1:up.');
  const env = readFileSync('.env.local', 'utf8');
  const required = [
    /^APP_ORIGIN=http:\/\/127\.0\.0\.1:8080\s*$/m,
    /^ALLOW_SIMULATED_PAYMENTS=true\s*$/m,
    /^NODE_ENV=development\s*$/m,
  ];
  if (!required.every((pattern) => pattern.test(env))) throw new Error('Not an approved local simulated-payment environment; refusing load test.');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 1000) throw new Error('STAGE2_CONCURRENCY must be between 1 and 1000');
};
async function main() {
  console.log('Stage 2 review: rerunning Stage 1 contract tests, independent demo tests, and Stage 2 load-harness tests.');
  run(process.execPath, ['--test', 'scripts/tests/stage1-smoke.test.mjs', 'scripts/tests/stage2-core.test.mjs', 'showcase/engine.test.mjs', 'showcase/server.test.mjs']);
  run('docker', ['compose', 'version']);
  run('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (!existsSync('.env.local')) run(process.execPath, ['scripts/setup-local.mjs']);
  safeLocalEnv();
  run('docker', [...compose, 'config', '-q']);
  console.log(`\nStage 2 disposable Docker project: ${project}. Stage 1 containers and volumes are NOT used.`);
  let created = false;
  try {
    created = true;
    run('docker', [...compose, 'up', '--detach', '--build', '--wait', '--wait-timeout', '420', 'postgres', 'migrate', 'redis', 'backend']);
    const output = run('docker', [...compose, 'run', '--rm', '-T', '--no-deps', '-e', `STAGE2_CONCURRENCY=${concurrency}`, '-e', 'STAGE2_REQUESTS=1000', '-e', 'STAGE2_TARGET=http://backend:3001', 'worker', 'node', 'scripts/stage2/load.mjs']);
    const line = output.split(/\r?\n/).find((value) => value.startsWith('STAGE2_REPORT_JSON='));
    if (!line) throw new Error('Load process exited without a machine-readable verified report.');
    const data = JSON.parse(line.slice('STAGE2_REPORT_JSON='.length));
    if (data.passed !== true || data.holds?.wins !== 10 || data.holds?.conflicts !== 990 || data.database?.soldSeats !== 10) throw new Error('Report invariants are invalid.');
    await mkdir('artifacts/stage2', { recursive: true });
    const file = 'artifacts/stage2/actual-http-postgres.json';
    await writeFile(file, JSON.stringify({ ...data, validation: 'Live isolated Docker/PostgreSQL run', composeProject: project }, null, 2) + '\n');
    console.log(`\nPASS Stage 2 real HTTP/PostgreSQL. Persistent report: ${file}`);
  } catch (error) {
    if (created) {
      console.error('\nStage 2 failed; collecting isolated stack diagnostics before cleanup.');
      try { run('docker', [...compose, 'ps', '--all']); } catch {}
      try {
        const out = spawnSync('docker', [...compose, 'logs', '--tail', '40', 'migrate', 'postgres', 'redis', 'backend'], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
        if (out.stdout) process.stderr.write(out.stdout);
        if (out.stderr) process.stderr.write(out.stderr);
      } catch {}
    }
    throw error;
  } finally {
    if (created) {
      console.log('\nCleaning up only the unique disposable Stage 2 Compose project and its volume.');
      try { run('docker', [...compose, 'down', '--volumes', '--remove-orphans']); }
      catch (error) { console.error(`WARNING: Stage 2 cleanup failed: ${error.message}. Manually remove only Compose project '${project}', not Stage 1.`); process.exitCode = 1; }
    }
  }
}
main().catch((error) => {
  console.error(`\nFAIL Stage 2 verification: ${error.message}`);
  console.error('For a complete live Stage 1 signoff, separately run npm run stage1:up followed by npm run stage1:verify.');
  process.exitCode = 1;
});
