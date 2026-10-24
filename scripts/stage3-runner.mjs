import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const id = `vibetix-s3-${randomBytes(5).toString('hex')}`;
const compose = ['compose', '-p', id, '--env-file', '.env.local', '-f', 'docker-compose.yml', '-f', 'docker-compose.stage2.yml'];
const concurrency = Number(process.env.STAGE3_CONCURRENCY ?? 24);
let active = null;
let interrupted = false;
let workStarted = false;
let result = null;
const emit = (kind, body) => console.log(`${kind}=${JSON.stringify(body)}`);
const step = (message) => emit('STAGE3_STEP_JSON', { message });
function ensureSafeConfig() {
  if (!existsSync('.env.local')) throw new Error('Local environment is missing');
  const text = readFileSync('.env.local', 'utf8');
  if (!/^NODE_ENV=development\s*$/m.test(text) || !/^ALLOW_SIMULATED_PAYMENTS=true\s*$/m.test(text) || !/^APP_ORIGIN=http:\/\/127\.0\.0\.1:8080\s*$/m.test(text)) {
    throw new Error('Only the approved local development configuration may be load-tested');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 1000) throw new Error('STAGE3_CONCURRENCY must be between 1 and 1000');
}
async function command(exe, args, { eventStream = false, env = process.env, cleanup = false } = {}) {
  if (interrupted && !cleanup) throw new Error('Run interrupted');
  let recentError = '';
  let parseError = null;
  const child = spawn(exe, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  active = child;
  const parse = (stream, isStdout) => {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      pending += chunk;
      if (pending.length > 2_000_000) pending = pending.slice(-256_000);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (eventStream && isStdout && line.startsWith('STAGE3_EVENT_JSON=')) {
          try {
            const data = JSON.parse(line.slice('STAGE3_EVENT_JSON='.length));
            if (['phase', 'progress'].includes(data.type)) emit('STAGE3_EVENT_JSON', data);
          } catch { /* Invalid lines are ignored and verification will fail if output is incomplete */ }
        } else if (eventStream && isStdout && line.startsWith('STAGE2_REPORT_JSON=')) {
          try { result = JSON.parse(line.slice('STAGE2_REPORT_JSON='.length)); }
          catch { parseError = new Error('Invalid JSON report'); }
        } else if (line.includes('FAIL Stage 2:')) recentError = line.replace(/^.*FAIL Stage 2:\s*/, '').slice(0, 300);
        else if (!isStdout && /error|fail|denied|not found|unavailable|refused/i.test(line)) recentError = line.slice(0, 300);
      }
    });
  };
  parse(child.stdout, true);
  parse(child.stderr, false);
  try {
    const status = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    if (parseError) throw parseError;
    if (status.code !== 0 || (interrupted && !cleanup)) throw new Error(recentError || `${exe} exited with code ${status.code ?? status.signal}`);
  } finally { if (active === child) active = null; }
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true;
  if (active) active.kill('SIGTERM');
});

async function main() {
  step('بررسی ۱۷ تست رگرسیون مراحل ۱، ۲ و ۳ ...');
  await command(process.execPath, ['--test', 'scripts/tests/stage1-smoke.test.mjs', 'scripts/tests/stage2-core.test.mjs', 'scripts/tests/stage3-core.test.mjs', 'scripts/tests/stage3-studio.test.mjs', 'showcase/engine.test.mjs', 'showcase/server.test.mjs']);
  step('بررسی Docker و تنظیمات محیط آزمایش ...');
  await command('docker', ['compose', 'version']);
  await command('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (!existsSync('.env.local')) await command(process.execPath, ['scripts/setup-local.mjs']);
  ensureSafeConfig();
  await command('docker', [...compose, 'config', '-q']);
  step('در حال ساخت محیط جداگانه PostgreSQL و Redis؛ داده‌های مرحله اول دست‌نخورده می‌مانند.');
  workStarted = true;
  await command('docker', [...compose, 'up', '--detach', '--build', '--wait', '--wait-timeout', '420', 'postgres', 'migrate', 'redis', 'backend']);
  if (interrupted) throw new Error('Run interrupted');
  step('پایگاه داده آماده است؛ اجرای رقابت ۱۰۰۰ درخواست HTTP ...');
  await command('docker', [...compose, 'run', '--rm', '-T', '--no-deps', '-e', `STAGE2_CONCURRENCY=${concurrency}`, '-e', 'STAGE2_REQUESTS=1000', '-e', 'STAGE2_TARGET=http://backend:3001', '-e', 'STAGE3_TELEMETRY=1', 'worker', 'node', 'scripts/stage2/load.mjs'], { eventStream: true });
  if (!result || result.passed !== true || result.holds?.wins !== 10 || result.holds?.conflicts !== 990 || result.holds?.unexpected !== 0 || result.metrics?.totalRequests !== 1000 || !result.database || result.database.soldSeats !== 10 || result.database.finalHolds !== 0 || result.database.orderCount !== 10 || result.database.itemCount !== 10 || result.database.ticketCount !== 10 || result.database.paymentCount !== 10 || Object.keys(result.database).length !== 6) throw new Error('HTTP/PostgreSQL invariants were not met');
}
let problem = null;
try { await main(); }
catch (error) { problem = error; }
finally {
  if (workStarted) {
    step('جمع‌آوری فقط محیط آزمایشی موقت (بدون حذف دیتابیس مرحله اول) ...');
    try { await command('docker', [...compose, 'down', '--volumes', '--remove-orphans']); }
    catch (error) { problem = problem ?? new Error(`Disposable Compose cleanup failed: ${error.message}`); }
  }
}
if (!problem && result && !interrupted) {
  try {
    const path = `artifacts/stage3/verified-${result.runId}.json`;
    await mkdir('artifacts/stage3', { recursive: true });
    await writeFile(`${path}.tmp`, JSON.stringify({ ...result, verification: 'Local isolated Docker / actual HTTP / PostgreSQL', composeProject: id }, null, 2) + '\n', { mode: 0o600 });
    await rename(`${path}.tmp`, path);
    emit('STAGE3_COMPLETE_JSON', { type: 'complete', report: result, reportFile: path });
    step('آزمون و پاک‌سازی موفق؛ گزارش راستی‌آزمایی‌شده روی دیسک ذخیره شد.');
  } catch (error) { problem = error; }
}
if (problem || interrupted) {
  const reason = problem?.message ?? 'Test failed';
  const helpful = /spawn docker ENOENT/.test(reason)
    ? 'Docker پیدا نشد. Docker Engine و Docker Compose را نصب و روشن کنید.'
    : reason;
  emit('STAGE3_ERROR_JSON', { message: interrupted ? 'آزمون متوقف شد؛ نتیجه‌ای تأیید نشد.' : helpful.slice(0, 300) });
  process.exitCode = 1;
}
