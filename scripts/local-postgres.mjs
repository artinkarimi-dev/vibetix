import EmbeddedPostgres from "embedded-postgres";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
const password = randomBytes(32).toString("hex");
await mkdir("artifacts/postgres", { recursive: true, mode: 0o700 });
const pg = new EmbeddedPostgres({
  databaseDir: "artifacts/postgres/data",
  port: 55432,
  user: "vibetix",
  password,
  authMethod: "scram-sha-256",
  persistent: false,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
await pg.initialise();
await pg.start();
await pg.createDatabase("vibetix_test");
await writeFile(
  ".env.fullstack.local",
  `DATABASE_URL=postgresql://vibetix:${password}@127.0.0.1:55432/vibetix_test?schema=public\nTICKET_SIGNING_KEY=${randomBytes(48).toString("hex")}\nAPP_ORIGIN=http://127.0.0.1:5188\nHOST=127.0.0.1\nPORT=3001\nALLOW_SIMULATED_PAYMENTS=true\nEMAIL_TRANSPORT=local\nALLOW_DATABASE_TESTS=true\n`,
  { mode: 0o600 },
);
console.info(
  "Temporary real PostgreSQL is ready on loopback port 55432. Credentials saved to ignored .env.fullstack.local.",
);
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
};
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
await new Promise(() => {});
