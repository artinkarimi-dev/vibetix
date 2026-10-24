import { spawnSync } from "node:child_process";
const url = process.env.MIGRATION_DATABASE_URL;
if (!url)
  throw new Error(
    "MIGRATION_DATABASE_URL is required; runtime credentials must not run migrations.",
  );
const result = spawnSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--schema",
    "backend/prisma/schema.prisma",
  ],
  {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
