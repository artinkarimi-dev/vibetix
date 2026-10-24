import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
try {
  await access(".env.local");
} catch {
  const r = spawnSync(process.execPath, ["scripts/setup-local.mjs"], {
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const result = spawnSync(
  "docker",
  ["compose", "--env-file", ".env.local", "up", "--build"],
  { stdio: "inherit" },
);
if (result.error)
  console.error(
    "Docker Compose is required for local:up. Install Docker or use the documented native PostgreSQL workflow.",
  );
process.exit(result.status ?? 1);
