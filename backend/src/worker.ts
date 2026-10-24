import { setTimeout } from "node:timers/promises";
import { createDatabase } from "./database/client.js";
import { loadConfig } from "./config.js";
import { expireHolds } from "./services/booking.js";
import { OutboxRunner } from "./services/jobs.js";
import { LocalEmailTransport, DemoEmailTransport } from "./services/email.js";
import { verifyRuntimeDatabase } from "./security/database.js";
const cfg = loadConfig();
const db = createDatabase(cfg);
await verifyRuntimeDatabase(db, cfg);
const emit = (event: string, fields: Record<string, number> = {}) =>
  process.stdout.write(
    JSON.stringify({ event, time: new Date().toISOString(), ...fields }) + "\n",
  );
let nextHeartbeat = 0;
let stopping = false;
process.once("SIGTERM", () => {
  stopping = true;
});
process.once("SIGINT", () => {
  stopping = true;
});
const jobs =
  cfg.APP_MODE === "portfolio" || cfg.EMAIL_TRANSPORT === "local"
    ? new OutboxRunner(
        db,
        cfg.APP_MODE === "portfolio"
          ? new DemoEmailTransport()
          : new LocalEmailTransport(),
        (event) => {
          emit(event);
        },
      )
    : null;
while (!stopping) {
  try {
    const expired = await expireHolds(db, () => stopping);
    if (expired) emit("hold_expired", { count: expired });
    if (stopping) break;
    await db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    if (!stopping && jobs) await jobs.runOnce();
    if (!stopping && Date.now() >= nextHeartbeat) {
      const [queue] = await db.$queryRaw<
        { pending: number; failed: number; oldestPendingSeconds: number }[]
      >`SELECT count(*) FILTER (WHERE status='PENDING')::int AS pending,count(*) FILTER (WHERE status='FAILED')::int AS failed,coalesce(extract(epoch FROM (clock_timestamp() AT TIME ZONE 'UTC')-min("createdAt") FILTER (WHERE status='PENDING')),0)::float8 AS "oldestPendingSeconds" FROM "OutboxJob"`;
      emit("worker_heartbeat", queue);
      nextHeartbeat = Date.now() + 15000;
    }
  } catch {
    process.stderr.write(
      JSON.stringify({
        event: "worker_iteration_failed",
        time: new Date().toISOString(),
      }) + "\n",
    );
  }
  await setTimeout(1000);
}
await db.$disconnect();
