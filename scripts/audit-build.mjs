import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const html = await readFile("dist/index.html", "utf8");
const paths = [
  ...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g),
].map((match) => match[1]);
const assets = await Promise.all(
  [...new Set(paths)].map(async (path) => {
    const contents = await readFile(`dist${path}`);
    return {
      path,
      bytes: contents.length,
      gzipBytes: gzipSync(contents).length,
    };
  }),
);
const jsGzipBytes = assets
  .filter((a) => a.path.endsWith(".js"))
  .reduce((sum, asset) => sum + asset.gzipBytes, 0);
const cssGzipBytes = assets
  .filter((a) => a.path.endsWith(".css"))
  .reduce((sum, asset) => sum + asset.gzipBytes, 0);
// Regression budgets for this frontend; not a substitute for browser metrics.
const passed =
  paths.length > 0 && jsGzipBytes <= 150000 && cssGzipBytes <= 20000;
const result = {
  assets,
  jsGzipBytes,
  cssGzipBytes,
  budgets: { jsGzipBytes: 150000, cssGzipBytes: 20000 },
  passed,
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/bundle-audit.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!passed) process.exitCode = 1;
