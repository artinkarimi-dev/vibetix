import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw new Error(`${command} is not available: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status ?? "unknown"}.`);
};
const compose = ["compose", "--env-file", ".env.local"];
const action = process.argv[2] ?? "up";
if (!["up", "down", "status", "logs"].includes(action)) {
  console.error("Usage: node scripts/stage1-up.mjs up|down|status|logs");
  process.exit(2);
}
try {
  run("docker", ["compose", "version"]);
  if (action === "up" && !existsSync(".env.local")) {
    run(process.execPath, ["scripts/setup-local.mjs"]);
  }
  if (!existsSync(".env.local")) {
    throw new Error("Missing .env.local. Run npm run stage1:up to generate it safely.");
  }
  if (action === "up") {
    const env = readFileSync(".env.local", "utf8");
    if (!/^APP_ORIGIN=http:\/\/127\.0\.0\.1:8080\s*$/m.test(env) || !/^ALLOW_SIMULATED_PAYMENTS=true\s*$/m.test(env)) {
      throw new Error("This development stack requires APP_ORIGIN=http://127.0.0.1:8080 and ALLOW_SIMULATED_PAYMENTS=true in .env.local. Back up custom configuration before editing it.");
    }
    run("docker", ["info", "--format", "{{.ServerVersion}}"]);
    run("docker", [...compose, "config", "-q"]);
    run("docker", [...compose, "up", "--detach", "--build", "--wait", "--wait-timeout", "300"]);
    console.log("\nVIBETIX full-stack services are ready (Docker health checks passed).");
    console.log("Website: http://127.0.0.1:8080");
    console.log("To verify a real booking in PostgreSQL: npm run stage1:verify");
    console.log("To stop without deleting data: npm run stage1:down");
  } else if (action === "down") {
    run("docker", [...compose, "down"]);
    console.log("Stopped. PostgreSQL volume retained.");
  } else if (action === "status") {
    run("docker", [...compose, "ps", "--all"]);
  } else {
    run("docker", [...compose, "logs", "--tail", "100", "backend", "frontend", "migrate", "postgres", "redis", "worker"]);
  }
} catch (error) {
  console.error(`\nStage 1: ${error.message}`);
  if (action === "up") console.error("Check Docker Desktop/Engine, local port 8080 and npm run stage1:logs. No database volumes have been deleted.");
  process.exitCode = 1;
}
