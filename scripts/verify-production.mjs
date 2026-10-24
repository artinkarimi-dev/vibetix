import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
if (
  process.env.ALLOW_DATABASE_TESTS !== "true" ||
  !process.env.DATABASE_URL ||
  !process.env.REDIS_TEST_URL
)
  throw new Error(
    "An isolated database, explicit ALLOW_DATABASE_TESTS=true and REDIS_TEST_URL are required.",
  );
const adminUrl = new URL(process.env.DATABASE_URL);
if (!adminUrl.pathname.endsWith("_test"))
  throw new Error("Use a dedicated *_test database.");
const roleUrl = (role) => {
  const value = new URL(adminUrl);
  value.username = role;
  value.password = randomBytes(32).toString("hex");
  return value.toString();
};
const env = {
  ...process.env,
  DATABASE_ADMIN_URL: adminUrl.toString(),
  MIGRATION_DATABASE_URL: roleUrl("vibetix_migrator"),
  RUNTIME_DATABASE_URL: roleUrl("vibetix_app"),
  ALLOW_DATABASE_ADMIN_OPERATION: "true",
  DATABASE_EXPECTED_NAME: adminUrl.pathname.slice(1),
  ROTATE_DATABASE_ROLE_PASSWORDS: "true",
};
const setup = spawnSync(
  process.execPath,
  ["scripts/ops/database-security.mjs"],
  { env: { ...env, DATABASE_URL: env.RUNTIME_DATABASE_URL }, stdio: "inherit" },
);
if (setup.status !== 0) process.exit(1);
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--test",
    ...readdirSync("backend/tests")
      .filter((name) => name.endsWith(".test.ts"))
      .map((name) => `backend/tests/${name}`),
  ],
  { env, stdio: "inherit" },
);
process.exit(result.status ?? 1);
