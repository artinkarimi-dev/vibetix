import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { open, readFile, lstat } from "node:fs/promises";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
const file = ".env.staging.local";
const action = process.argv[2];
const compose = [
  "compose",
  "--project-name",
  "vibetix-staging",
  "--env-file",
  file,
  "-f",
  "docker-compose.yml",
  "-f",
  "deploy/compose.staging.yml",
];
function docker(args) {
  const safeEnv = { ...process.env };
  for (const key of [
    "POSTGRES_PASSWORD",
    "MIGRATION_DATABASE_PASSWORD",
    "APP_DATABASE_PASSWORD",
    "TICKET_SIGNING_KEY",
    "ABUSE_KEY_SECRET",
  ])
    delete safeEnv[key];
  const r = spawnSync("docker", args, { stdio: "inherit", env: safeEnv });
  if (r.error || r.status !== 0)
    throw new Error("Docker staging command failed. No volume was deleted.");
}
try {
  if (action === "init") {
    const f = await open(file, "wx", 0o600);
    try {
      await f.writeFile(
        [
          "# Generated isolated loopback staging secrets. Never commit or use for production.",
          ...[
            "POSTGRES_PASSWORD",
            "MIGRATION_DATABASE_PASSWORD",
            "APP_DATABASE_PASSWORD",
            "TICKET_SIGNING_KEY",
            "ABUSE_KEY_SECRET",
          ].map((k) => `${k}=${randomBytes(32).toString("hex")}`),
        ].join("\n") + "\n",
      );
    } finally {
      await f.close();
    }
    console.info(
      "Created private staging configuration without printing secrets.",
    );
  } else {
    if (!["up", "verify", "down"].includes(action))
      throw new Error(
        "Use staging:init, staging:up, staging:verify or staging:down.",
      );
    const probe = spawnSync("docker", ["compose", "version"], {
      stdio: "ignore",
    });
    if (probe.error || probe.status !== 0)
      throw new Error(
        "Docker Compose unavailable; container execution is BLOCKED. Native verification: pnpm test:preproduction.",
      );
    const st = await lstat(file);
    if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) !== 0)
      throw new Error(
        "Staging configuration must be a private regular file (mode 600).",
      );
    const env = parseEnv(await readFile(file, "utf8"));
    for (const k of [
      "POSTGRES_PASSWORD",
      "MIGRATION_DATABASE_PASSWORD",
      "APP_DATABASE_PASSWORD",
      "TICKET_SIGNING_KEY",
      "ABUSE_KEY_SECRET",
    ])
      if (!/^[a-f0-9]{64,}$/.test(env[k] ?? ""))
        throw new Error(
          "Generate independent staging secrets with staging:init; placeholders are rejected.",
        );
    if (new Set(Object.values(env)).size !== Object.keys(env).length)
      throw new Error("Staging secrets must be independent.");
    if (action === "up")
      docker([
        ...compose,
        "up",
        "--build",
        "--detach",
        "--wait",
        "--wait-timeout",
        "180",
      ]);
    if (action === "down") docker([...compose, "down", "--timeout", "30"]); // Deliberately no --volumes.
    if (action === "verify") {
      docker([
        ...compose,
        "run",
        "--rm",
        "--no-deps",
        "migrate",
        "node",
        "scripts/ops/preflight.mjs",
      ]);
      const base = "http://localhost:8088";
      let cookie = "";
      async function call(path, body) {
        const r = await fetch(base + "/api/v1" + path, {
          method: body ? "POST" : "GET",
          headers: {
            origin: base,
            ...(cookie ? { cookie } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { r, data: await r.json() };
      }
      const email = `staging-smoke-${randomBytes(12).toString("hex")}@example.test`,
        password = randomBytes(24).toString("hex");
      assert.equal(
        (
          await call("/auth/register", {
            email,
            password,
            firstName: "Staging",
            lastName: "Smoke",
          })
        ).r.status,
        201,
      );
      const login = await call("/auth/login", { email, password });
      assert.equal(login.r.status, 200);
      cookie = login.r.headers.get("set-cookie").split(";")[0];
      assert.ok((await call("/catalog")).data.events.length > 0);
      assert.equal((await call("/orders")).r.status, 200);
      assert.equal((await call("/auth/logout", {})).r.status, 200);
      assert.equal((await call("/orders")).r.status, 401);
      console.info(
        "Container staging database preflight and authentication/catalog smoke passed. Full booking/load/restore qualification is a separate release:verify gate.",
      );
    }
  }
} catch (error) {
  console.error(
    error.code === "EEXIST"
      ? "Existing staging configuration preserved."
      : error.code === "ENOENT"
        ? "Run pnpm staging:init first."
        : error instanceof assert.AssertionError
          ? "Staging smoke assertion failed; no response data printed."
          : error.message,
  );
  process.exitCode = 1;
}
