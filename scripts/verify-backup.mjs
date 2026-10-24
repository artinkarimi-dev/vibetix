import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  mkdtemp,
  writeFile,
  readFile,
  stat,
  rm,
  mkdir,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backup, restore } from "./ops/backup.mjs";
import { connect, sqlIdentifier } from "./ops/database.mjs";
if (process.env.ALLOW_DATABASE_TESTS !== "true" || !process.env.DATABASE_URL)
  throw new Error("An isolated test database is required.");
const database = `vibetix_restore_${randomUUID().replaceAll("-", "")}`;
const previous = { ...process.env },
  dir = await mkdtemp(join(tmpdir(), "vibetix-backup-drill-")),
  start = performance.now();
const source = await connect("DATABASE_URL");
let created = false;
try {
  const target = new URL(process.env.DATABASE_URL);
  target.pathname = "/" + database;
  const key = join(dir, "key");
  await writeFile(key, randomBytes(32).toString("hex"), { mode: 0o600 });
  Object.assign(process.env, {
    BACKUP_DATABASE_URL: process.env.DATABASE_URL,
    RESTORE_DATABASE_URL: target.toString(),
    BACKUP_KEY_FILE: key,
    DATABASE_EXPECTED_NAME: database,
  });
  const expected = (
    await source.query(
      'SELECT (SELECT count(*) FROM "EventSeat")::int AS seats,(SELECT count(*) FROM "Order")::int AS orders,(SELECT count(*) FROM "Ticket")::int AS tickets',
    )
  ).rows[0];
  const file = join(dir, "backup.vbt");
  await backup(file);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  await source.query(`CREATE DATABASE ${sqlIdentifier(database)}`);
  created = true;
  delete process.env.ALLOW_DATABASE_RESTORE;
  await assert.rejects(restore(file), /authorization/);
  process.env.ALLOW_DATABASE_RESTORE = "true";
  const tampered = join(dir, "tampered.vbt"),
    bytes = await readFile(file);
  bytes[30] ^= 1;
  await writeFile(tampered, bytes, { mode: 0o600 });
  await assert.rejects(restore(tampered));
  const empty = await connect("RESTORE_DATABASE_URL");
  try {
    assert.equal(
      (
        await empty.query(
          "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await empty.end();
  }
  await restore(file);
  const restored = await connect("RESTORE_DATABASE_URL");
  try {
    const actual = (
      await restored.query(
        'SELECT (SELECT count(*) FROM "EventSeat")::int AS seats,(SELECT count(*) FROM "Order")::int AS orders,(SELECT count(*) FROM "Ticket")::int AS tickets',
      )
    ).rows[0];
    assert.deepEqual(actual, expected);
    assert.ok(
      (
        await restored.query(
          "SELECT 1 FROM pg_constraint WHERE conname='order_money_balanced'",
        )
      ).rowCount,
    );
  } finally {
    await restored.end();
  }
  await assert.rejects(restore(file), /must be empty/);
  await mkdir("artifacts/hardening", { recursive: true });
  await writeFile(
    "artifacts/hardening/restore-drill.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "encrypted backup file is private",
          "restore requires explicit exact-target authorization",
          "tampering fails before schema writes",
          "empty-database logical restore matches seat/order/ticket counts",
          "money constraint preserved",
          "nonempty target rejected",
        ],
        milliseconds: performance.now() - start,
        counts: expected,
        scope:
          "Disposable local PostgreSQL only; not production RPO/RTO, PITR or offsite recovery.",
      },
      null,
      2,
    ),
  );
  console.info("Disposable encrypted backup/restore drill passed.");
} finally {
  if (created) await source.query(`DROP DATABASE ${sqlIdentifier(database)}`);
  await source.end();
  await rm(dir, { recursive: true, force: true });
  for (const key of Object.keys(process.env))
    if (!(key in previous)) delete process.env[key];
  Object.assign(process.env, previous);
}
