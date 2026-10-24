import { spawnSync } from 'node:child_process';

const checks = [
  ['مرحله ۱: راه‌اندازی واقعی کل استک Docker', ['scripts/stage1-up.mjs', 'up']],
  ['مرحله ۱: خرید، ورود مجدد و تطبیق مستقیم با PostgreSQL', ['scripts/stage1-smoke.mjs']],
  ['مراحل ۲ و ۳: تست رگرسیون، رقابت HTTP و راستی‌آزمایی PostgreSQL', ['scripts/stage3-runner.mjs']],
];
for (const [name, args] of checks) {
  console.log(`\n========== ${name} ==========\n`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`\nFAIL: ${name}. Subsequent stages were not run. Stage 1 volumes were preserved.`);
    process.exit(result.status || 1);
  }
}
console.log('\nPASS: Stage 1 local Docker/PostgreSQL purchase verified, Stage 2 1000 HTTP requests verified, Stage 3 streaming telemetry verified.');
console.log('Studio: npm run stage3:studio');
