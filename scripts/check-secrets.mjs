import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
async function walk(path) {
  return (
    await Promise.all(
      (await readdir(path, { withFileTypes: true })).map((entry) => {
        const file = join(path, entry.name);
        if (["node_modules", "dist", ".postgres"].includes(entry.name))
          return [];
        return entry.isDirectory() ? walk(file) : [file];
      }),
    )
  ).flat();
}
const paths = (
  await Promise.all(
    [
      "src",
      "backend/src",
      "backend/prisma",
      "packages/shared/src",
      "scripts",
      "frontend",
      "deploy",
      ".github",
    ].map(walk),
  )
).flat();
for (const path of paths) {
  const text = await readFile(path, "utf8");
  assert.ok(
    !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/.test(
      text,
    ),
    `Potential credential: ${path}`,
  );
  for (const match of text.matchAll(
    /(?:postgres(?:ql)?|rediss?):\/\/[^\s'"`]+/g,
  )) {
    if (match[0].includes("${")) continue;
    let url;
    try {
      url = new URL(match[0]);
    } catch {
      continue;
    }
    if (!url.password) continue;
    const placeholder = decodeURIComponent(url.password);
    assert.ok(
      placeholder.startsWith("REPLACE_") ||
        (path === ".github/workflows/ci.yml" &&
          placeholder === "ci-isolated-only"),
      `Embedded connection credential: ${path}`,
    );
  }
}
console.info(
  `Secret patterns checked in ${paths.length} project files; values are never printed. Ignored env/private directories and Git history were not scanned.`,
);
