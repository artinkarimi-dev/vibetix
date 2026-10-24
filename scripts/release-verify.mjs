import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
const root = resolve("artifacts/release");
await mkdir(root, { recursive: true });
const checks = [];
const start = Date.now();
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
async function run(name, exe, args, env = process.env) {
  const log = createWriteStream(`${root}/${name}.log`, { mode: 0o600 });
  const started = Date.now();
  console.info(`RUN ${name}`);
  const child = spawn(exe, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const status = await new Promise((r) => {
    child.once("error", () => r(1));
    child.once("exit", (code) => r(code ?? 1));
  });
  await new Promise((r) => log.end(r));
  const row = {
    name,
    status: status === 0 ? "pass" : "fail",
    command: [exe, ...args].join(" "),
    exitCode: status,
    durationMs: Date.now() - started,
    evidence: `artifacts/release/${name}.log`,
  };
  checks.push(row);
  console.info(`${row.status.toUpperCase()} ${name}`);
  return status === 0;
}
const nativeAvailable =
  process.platform === "linux" &&
  spawnSync("openssl", ["version"], { stdio: "ignore" }).status === 0;
const browserEnv = { ...process.env };
// In CI, supply PNPM_STORE_DIR if a non-default store is intentionally used.
const installArgs = [
  "install",
  "--frozen-lockfile",
  ...(process.env.PNPM_STORE_DIR
    ? [`--store-dir=${process.env.PNPM_STORE_DIR}`]
    : []),
];
const resuming = process.argv.includes("--resume");
async function resume() {
  const previous = JSON.parse(
    await readFile(`${root}/final-verification.json`, "utf8"),
  );
  const cutoff = Date.parse(previous.completedAt);
  // Reuse only when runtime/UI/tests/dependency inputs predate the completed run.
  // Operational JS changes are rechecked by format/security and the entire native suite.
  async function unchanged(path) {
    const info = await stat(path);
    if (info.isDirectory())
      for (const entry of await readdir(path))
        await unchanged(`${path}/${entry}`);
    else if (info.mtimeMs > cutoff)
      throw new Error("Protected inputs changed; full verification required.");
  }
  for (const path of [
    "src",
    "public",
    "backend/src",
    "backend/tests",
    "backend/prisma",
    "packages/shared",
    "tests",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "playwright.config.ts",
    "vite.config.ts",
    "vitest.config.ts",
    "tsconfig.json",
    "backend/package.json",
    "index.html",
    "tsconfig.app.json",
    "tsconfig.node.json",
    "tsconfig.tests.json",
    "backend/tsconfig.json",
    "backend/tsconfig.tests.json",
  ])
    await unchanged(path);
  const output = JSON.parse(
    await readFile(`${root}/build-checksums.json`, "utf8"),
  );
  if (!output.files.length) throw new Error("Missing output identities.");
  for (const f of output.files)
    if (
      createHash("sha256")
        .update(await readFile(f.path))
        .digest("hex") !== f.sha256
    )
      throw new Error("Build outputs changed; full verification required.");
  const rerun = new Set([
    "format",
    "security",
    "native-stack-load-recovery",
    "checksums",
  ]);
  const derived = new Set([
    "backend-security-tests",
    "real-stack-browser",
    "database-preflight",
    "backup-restore-integrity",
    "outage-and-sigterm",
    "hot-event-correctness",
    "outbox-crash-backoff",
  ]);
  for (const row of previous.checks.filter(
    (c) => c.command && !rerun.has(c.name) && !derived.has(c.name),
  )) {
    if (row.status !== "pass")
      throw new Error(
        "Other failed prerequisites require a full verification.",
      );
    // Retain exact prior command and evidence. This is reuse, not a claim of rerun.
    checks.push({
      ...row,
      reusedFrom: previous.completedAt,
      evidenceSha256: createHash("sha256")
        .update(await readFile(resolve(row.evidence)))
        .digest("hex"),
    });
  }
  checks.push({
    name: "resume-safety",
    status: "pass",
    reason:
      "Protected source/test/lock inputs unchanged since prior completion; compiled/static SHA-256 identities match. Prior passing stages retain provenance.",
  });
  await run("format", pnpm, ["format:check"]);
  await run("security", pnpm, ["security:check"]);
  await run(
    "native-stack-load-recovery",
    pnpm,
    ["test:preproduction"],
    browserEnv,
  );
  await run("checksums", process.execPath, ["scripts/build-checksums.mjs"]);
  checks.push({
    name: "docker-runtime",
    status: "not-executed",
    reason:
      "Container qualification was not resumed; this host has no Docker. No runtime claim.",
  });
}
try {
  if (resuming) await resume();
  else {
    let usable = await run("frozen-install", pnpm, installArgs);
    if (usable) usable = await run("generate", pnpm, ["db:generate"]);
    if (usable) {
      for (const [name, args] of [
        ["format", ["format:check"]],
        ["lint", ["lint"]],
        ["typecheck", ["typecheck"]],
        ["backend-typecheck", ["backend:typecheck"]],
        ["frontend-unit", ["test"]],
        ["frontend-build", ["build"]],
        ["backend-build", ["backend:build"]],
        ["bundle-audit", ["build:audit"]],
        ["image-audit", ["images:audit"]],
        ["security", ["security:check"]],
        ["dependency-audit", ["audit", "--json"]],
      ])
        await run(name, pnpm, args);
      await run("chromium", pnpm, ["test:e2e"], browserEnv);
      await run("portfolio-ui", pnpm, ["test:portfolio"], browserEnv);
      await run("payment-failure", pnpm, ["test:payment-failure"], browserEnv);
      if (nativeAvailable)
        await run(
          "native-stack-load-recovery",
          pnpm,
          ["test:preproduction"],
          browserEnv,
        );
      else
        checks.push({
          name: "native-stack-load-recovery",
          status: "not-executed",
          reason:
            "Linux/OpenSSL native lab prerequisite unavailable; no passing infrastructure claim.",
        });
      await run("runtime-inventory", pnpm, [
        ...(process.env.PNPM_STORE_DIR
          ? [`--config.store-dir=${process.env.PNPM_STORE_DIR}`]
          : []),
        "licenses",
        "list",
        "--prod",
        "--json",
      ]);
      const inventory = checks.find((x) => x.name === "runtime-inventory");
      if (inventory?.status === "pass") {
        await mkdir("artifacts/preproduction", { recursive: true });
        await writeFile(
          "artifacts/preproduction/runtime-dependencies.json",
          await readFile(`${root}/runtime-inventory.log`),
        );
        await run("sbom", process.execPath, [
          "scripts/create-runtime-sbom.mjs",
        ]);
      }
      await run("checksums", process.execPath, ["scripts/build-checksums.mjs"]);
      const docker = spawnSync("docker", ["info"], { stdio: "ignore" });
      if (docker.status === 0) {
        // Explicit opt-in target is the isolated staging profile, never a production deployment.
        let initialized = true;
        try {
          await readFile(".env.staging.local");
        } catch {
          initialized = await run("staging-init", pnpm, ["staging:init"]);
        }
        if (initialized)
          try {
            if (await run("container-stack", pnpm, ["staging:up"]))
              await run("container-smoke", pnpm, ["staging:verify"]);
          } finally {
            await run("container-stop", pnpm, ["staging:down"]);
          }
        checks.push({
          name: "container-layer-hardening-scan",
          status: "not-executed",
          reason:
            "A running Compose smoke alone does not certify UID/mount/capability/layer/CVE inspection; perform separately.",
        });
      } else
        checks.push({
          name: "docker-runtime",
          status: "not-executed",
          reason:
            "Docker CLI/daemon unavailable. Static recipes only; container qualification remains an external gate.",
        });
    }
  }
} catch {
  checks.push({
    name: "verification-runner",
    status: "fail",
    reason:
      "Runner failed; inspect allowlisted local stage logs. No raw errors or secrets emitted.",
  });
}
const required = [
  "frozen-install",
  "generate",
  "format",
  "lint",
  "typecheck",
  "backend-typecheck",
  "frontend-unit",
  "frontend-build",
  "backend-build",
  "bundle-audit",
  "image-audit",
  "security",
  "dependency-audit",
  "chromium",
  "portfolio-ui",
  "payment-failure",
  "native-stack-load-recovery",
  "runtime-inventory",
  "sbom",
  "checksums",
];
for (const name of required)
  if (!checks.some((c) => c.name === name))
    checks.push({
      name,
      status: "not-executed",
      reason: "An earlier prerequisite failed.",
    });
if (
  checks.some(
    (c) => c.name === "native-stack-load-recovery" && c.status === "pass",
  )
) {
  const native = JSON.parse(
    await readFile("artifacts/preproduction/results.json", "utf8"),
  );
  const load = JSON.parse(
    await readFile("artifacts/preproduction/hot-event-load.json", "utf8"),
  );
  for (const name of [
    "backend-security-tests",
    "real-stack-browser",
    "database-preflight",
    "backup-restore-integrity",
    "outage-and-sigterm",
    "hot-event-correctness",
    "outbox-crash-backoff",
  ])
    checks.push({
      name,
      status: native.passed && load.passed ? "pass" : "fail",
      evidence:
        "artifacts/preproduction/results.json; hot-event-load.json; existing-backend-tests.log",
    });
}
for (const [name, reason] of [
  ["remote-ci", "No usable repository/remote execution context"],
  ["container-cve-scan", "No Docker/scanner available on this validation host"],
  ["public-tls", "No public hostname/certificate target"],
  ["offsite-pitr", "No external recovery infrastructure configured"],
  [
    "external-alert-delivery",
    "No monitoring account/notification route configured",
  ],
])
  checks.push({ name, status: "not-executed", reason });
const passed =
  required.every((name) =>
    checks.some((c) => c.name === name && c.status === "pass"),
  ) && !checks.some((c) => c.status === "fail");
const decision = passed
  ? "LOCAL/STAGING RELEASE ENGINEERING: READY — EXTERNAL PRODUCTION GATES REMAIN"
  : "LOCAL/STAGING RELEASE ENGINEERING: NOT READY";
const report = {
  schemaVersion: 1,
  completedAt: new Date().toISOString(),
  durationMs: Date.now() - start,
  checks,
  decision,
  publicProductionApproved: false,
  portfolioDemoRepositoryReady: passed,
  commercialTicketingApproved: false,
  scope:
    "Local source/build/native execution only. Container, remote CI and hosted services require separate evidence.",
  externalGates: [
    "Container image/runtime/layer/CVE qualification",
    "remote CI run",
    "managed PostgreSQL/Redis and tested private network",
    "public TLS/DNS/renewal",
    "managed secrets and rotation",
    "demo retention/reset schedule, monitoring and owner contact",
    "target capacity smoke/load test",
  ],
  commercialOnlyGates: [
    "real payment/webhook/reconciliation/refund provider",
    "real admin MFA and customer recovery",
    "real email",
    "admission/check-in",
    "offsite/PITR and key escrow for financial recovery",
    "merchant governance and customer operations",
  ],
};
await writeFile(
  `${root}/final-verification.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.info(decision);
if (!passed) process.exitCode = 1;
