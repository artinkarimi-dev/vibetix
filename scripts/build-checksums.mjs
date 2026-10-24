import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) await walk(path);
    else
      files.push({
        path,
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      });
  }
}
for (const dir of ["dist", "backend/dist"]) await walk(dir);
if (!files.length) throw new Error("Build outputs required.");
await mkdir("artifacts/release", { recursive: true });
await writeFile(
  "artifacts/release/build-checksums.json",
  JSON.stringify(
    {
      algorithm: "sha256",
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    },
    null,
    2,
  ) + "\n",
);
console.info(
  `Checksums generated for ${files.length} compiled/static files. No provenance certification.`,
);
