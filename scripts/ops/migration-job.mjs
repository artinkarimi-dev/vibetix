import { spawnSync } from "node:child_process";
const run = (path, args = [], env = process.env) => {
  const r = spawnSync(process.execPath, [path, ...args], {
    env,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("scripts/ops/database-security.mjs", ["roles"]);
run("scripts/ops/migrate.mjs");
if (process.env.SEED_DEVELOPMENT_DATA === "true") {
  if (process.env.NODE_ENV !== "development")
    throw new Error("Automatic seed is local development only.");
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "backend/prisma/seed.ts"],
    {
      env: { ...process.env, DATABASE_URL: process.env.MIGRATION_DATABASE_URL },
      stdio: "inherit",
    },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}
run("scripts/ops/database-security.mjs");
