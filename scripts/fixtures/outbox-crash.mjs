import { createDatabase } from "../../backend/src/database/client.ts";
import { OutboxRunner } from "../../backend/src/services/jobs.ts";
if (
  process.env.ALLOW_DATABASE_TESTS !== "true" ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error("Isolated test database required.");
const db = createDatabase({ DATABASE_URL: process.env.DATABASE_URL });
const keepAlive = setInterval(() => {}, 1000);
try {
  await new OutboxRunner(db, {
    deliver: async () => {
      console.info("OUTBOX_CLAIMED");
      await new Promise(() => {});
      return "LOCAL_CAPTURED";
    },
  }).runOnce();
} finally {
  clearInterval(keepAlive);
  await db.$disconnect();
}
