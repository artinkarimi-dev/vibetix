import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? files(`${dir}/${e.name}`) : `${dir}/${e.name}`,
      ),
    )
  ).flat();
}
const source = (
  await Promise.all((await files("src")).map((f) => readFile(f, "utf8")))
).join("\n");
const report = [];
const errors = [];
for (const path of await files("public")) {
  if (!/\.(webp|png|jpe?g|gif|avif)$/i.test(path)) continue;
  const info = await sharp(path).metadata();
  const bytes = (await stat(path)).size;
  const url = path.replace(/^public/, "");
  const referenced = source.includes(url);
  report.push({
    path,
    width: info.width,
    height: info.height,
    bytes,
    referenced,
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
  });
  if (!path.endsWith(".webp")) errors.push(`Non-WebP raster: ${path}`);
  if (!referenced) errors.push(`Unreferenced production raster: ${path}`);
  if (bytes > 250000)
    errors.push(`Image exceeds 250 KB review budget: ${path}`);
}
const duplicates = report.filter((item, index) =>
  report.slice(0, index).some((other) => item.sha256 === other.sha256),
);
if (duplicates.length)
  errors.push(
    `Duplicate content: ${duplicates.map((item) => item.path).join(", ")}`,
  );
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/asset-audit.json",
  JSON.stringify(
    {
      images: report,
      totalBytes: report.reduce((sum, item) => sum + item.bytes, 0),
      errors,
    },
    null,
    2,
  ),
);
console.log(
  `${report.length} raster assets, ${report.reduce((sum, item) => sum + item.bytes, 0)} bytes; ${errors.length} problems`,
);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
