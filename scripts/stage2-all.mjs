import { spawnSync } from 'node:child_process';
const tasks = [
  ['Stage 1: deploy full stack', 'scripts/stage1-up.mjs', 'up'],
  ['Stage 1: live purchase and PostgreSQL audit', 'scripts/stage1-smoke.mjs'],
  ['Stage 2: isolated 1000-request HTTP/PostgreSQL race', 'scripts/stage2-verify.mjs'],
];
for (const [label, file, ...args] of tasks) {
  console.log(`\n====== ${label} ======\n`);
  const result = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`\nFAIL ${label}. Subsequent checks were not run. The Stage 1 database volume was not deleted.`);
    process.exit(result.status ?? 1);
  }
}
console.log('\nPASS All stages: live Stage 1 checkout persisted in PostgreSQL and Stage 2 HTTP competition verified independently.');
