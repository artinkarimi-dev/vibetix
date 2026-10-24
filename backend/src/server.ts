import { createDatabase } from "./database/client.js";
import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { verifyRuntimeDatabase } from "./security/database.js";
const cfg = loadConfig();
const db = createDatabase(cfg);
await verifyRuntimeDatabase(db, cfg);
const app = await buildApp(db, cfg);
const shutdown = async () => {
  await app.close();
  await db.$disconnect();
};
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
await app.listen({ port: cfg.PORT, host: cfg.HOST });
