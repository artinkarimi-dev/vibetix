import { connect } from "./ops/database.mjs";
import { verifyDemoResetTarget } from "../backend/src/security/demo.ts";
verifyDemoResetTarget(process.env);
const db = await connect("DEMO_DATABASE_ADMIN_URL");
try {
  await db.query("BEGIN");
  await db.query("SET LOCAL statement_timeout='30s'");
  const active = (
    await db.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND usename='vibetix_app' AND pid<>pg_backend_pid()",
    )
  ).rows[0].n;
  if (active)
    throw new Error("Stop all demo API/worker processes before resetting.");
  const real = (
    await db.query(
      `SELECT count(*)::int AS n FROM "Payment" WHERE provider NOT IN ('simulation','portfolio-demo')`,
    )
  ).rows[0].n;
  if (real) throw new Error("Refusing to erase non-demo payment records.");
  if (!process.argv.includes("--dry-run")) {
    for (const table of [
      "OutboxJob",
      "Ticket",
      "OrderItem",
      "Payment",
      "Order",
      "SeatHold",
      "Favorite",
      "Session",
      "User",
      "EventSeat",
      "Event",
      "Seat",
      "Section",
      "Venue",
      "Artist",
      "Extra",
      "PromoCode",
      "AuditLog",
    ])
      await db.query(`DELETE FROM "${table}"`);
  }
  await db.query("COMMIT");
  console.info(
    process.argv.includes("--dry-run")
      ? "Demo reset guards passed; no data changed."
      : "Demo data reset. Migration history and role grants preserved. Run portfolio seed before restarting traffic.",
  );
} catch {
  await db.query("ROLLBACK").catch(() => {});
  console.error(
    "Demo reset refused or failed; transaction rolled back. Check target, explicit confirmation, offline processes and payment types. No secrets printed.",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
