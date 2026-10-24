import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const read = (path) => readFile(path, "utf8");
const checks = [];
async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(root, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}
const source = (
  await Promise.all(["src", "backend/src", "packages/shared/src"].map(files))
).flat();
for (const path of source) {
  const value = await read(path);
  assert.ok(
    !/dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\s*\(|(?<![.\w])eval\s*\(|new Function\s*\(|\$(?:queryRawUnsafe|executeRawUnsafe)\b/.test(
      value,
    ),
    `Unsafe sink requires review: ${path}`,
  );
}
checks.push(
  "Selected source trees contain none of the checked unsafe HTML/code/SQL sinks",
);
const ignored = await read(".dockerignore");
for (const name of [
  ".aws",
  ".codex",
  ".agents",
  ".ssh",
  ".npmrc",
  ".netrc",
  "**/.env",
  "**/*.key",
])
  assert.ok(
    ignored.split(/\r?\n/).includes(name),
    `Missing Docker exclusion: ${name}`,
  );
for (const path of ["frontend/Dockerfile", "backend/Dockerfile"])
  assert.ok(
    !/^COPY\s+\.\s/m.test(await read(path)),
    `Broad Docker COPY in ${path}`,
  );
assert.match(await read("backend/Dockerfile"), /^USER node$/m);
assert.match(await read("frontend/Dockerfile"), /^USER nginx$/m);
for (const path of ["frontend/Dockerfile", "backend/Dockerfile"])
  for (const line of (await read(path))
    .split("\n")
    .filter((line) => line.startsWith("FROM ")))
    assert.match(
      line,
      /@sha256:[a-f0-9]{64}(?:\s|$)/,
      `Mutable image in ${path}`,
    );
for (const match of (await read(".github/workflows/ci.yml")).matchAll(
  /uses:\s*([^\s#]+)/g,
))
  assert.match(match[1], /@[a-f0-9]{40}$/, "CI actions must be pinned commits");
checks.push("Non-root nginx, immutable image references and CI action pins");
assert.match(await read("docker-compose.yml"), /127\.0\.0\.1:8080:8080/);
assert.match(
  await read(".github/workflows/ci.yml"),
  /permissions:\s+contents: read/,
);
checks.push(
  "Docker copy scope, sensitive exclusions, backend user, loopback publishing and CI permissions",
);
const nginx = await read("frontend/nginx.conf");
for (const header of [
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "Referrer-Policy",
])
  assert.ok(nginx.includes(header));
assert.ok(
  nginx.includes("frame-ancestors 'none'") &&
    nginx.includes("script-src 'self'"),
);
checks.push(
  "Static nginx header directives present; runtime/TLS remain unverified",
);
for (const path of [...source, ...(await files("dist"))]) {
  if (!/\.(?:tsx?|js|mjs|json|html|css)$/.test(path)) continue;
  assert.ok(
    !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b/.test(
      await read(path),
    ),
    `Potential embedded credential in ${path}`,
  );
}
checks.push(
  "Limited private-key/AWS-access-key pattern scan of selected source and deployable assets",
);
const fixtureBuild = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build"],
  {
    env: { ...process.env, VITE_USE_FIXTURES: "true" },
    encoding: "utf8",
  },
);
assert.notEqual(fixtureBuild.status, 0);
assert.match(
  fixtureBuild.stderr + fixtureBuild.stdout,
  /Fixture authentication and checkout cannot be included/,
);
checks.push("Deployable fixture-mode build fails closed");
const accidentalSecret = "sentinel-private-build-value";
const publicSecretBuild = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build"],
  {
    env: { ...process.env, VITE_ACCIDENTAL_SECRET: accidentalSecret },
    encoding: "utf8",
  },
);
assert.notEqual(publicSecretBuild.status, 0);
assert.match(
  publicSecretBuild.stderr + publicSecretBuild.stdout,
  /Unexpected public build configuration/,
);
assert.ok(
  !(publicSecretBuild.stderr + publicSecretBuild.stdout).includes(
    accidentalSecret,
  ),
);
checks.push(
  "Unreviewed public build variables fail without printing their values",
);
await mkdir("artifacts/security", { recursive: true });
await writeFile(
  "artifacts/security/static-checks.json",
  JSON.stringify(
    {
      checks,
      limitations:
        "Pattern checks only; no exhaustive SAST, history scan, container scan, or live proxy verification.",
    },
    null,
    2,
  ),
);
console.info(checks.map((check) => `PASS ${check}`).join("\n"));
