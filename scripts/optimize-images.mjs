import { mkdir, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  const bundled = process.env.VIBETIX_SHARP_PATH;
  if (!bundled)
    throw new Error(
      "Set VIBETIX_SHARP_PATH to the bundled sharp/dist/index.mjs, or install Sharp locally.",
    );
  ({ default: sharp } = await import(pathToFileURL(resolve(bundled)).href));
}

export const imageManifest = [
  ["extras-lounge", 768, 512],
  ["extras-parking", 768, 512],
  ["extras-fast-lane", 768, 512],
  ["extras-merch", 768, 512],
  ["extras-photo", 768, 512],
  ["artist-maya-chen", 640, 426],
  ["artist-the-midnight-collective", 640, 426],
  ["artist-noah-blake", 640, 426],
  ["venue-garden", 768, 512],
  ["venue-harbor", 768, 512],
  ["venue-northstar", 768, 512],
].map(([name, width, height]) => ({
  source: `artifacts/image-sources/${name}.png`,
  output: `public/images/${name}.webp`,
  width,
  height,
  quality: 80,
}));
imageManifest.push(
  ...[
    ["echoes-hero", 1600, 900],
    ["echoes-mobile", 768, 960],
    ["echoes-card", 640, 426],
  ].map(([name, width, height]) => ({
    source: "artifacts/image-sources/echoes-source.png",
    output: `public/images/${name}.webp`,
    width,
    height,
    quality: 80,
  })),
);
for (const artist of ["maya-chen", "the-midnight-collective", "noah-blake"]) {
  for (const [variant, width, height] of [
    ["hero", 1280, 720],
    ["mobile", 768, 960],
  ]) {
    imageManifest.push({
      source: `artifacts/image-sources/artist-${artist}.png`,
      output: `public/images/artist-${artist}-${variant}.webp`,
      width,
      height,
      quality: 80,
    });
  }
}

const selected = process.argv.slice(2);
for (const item of imageManifest.filter(
  (item) =>
    !selected.length ||
    selected.some((name) => item.output.endsWith(`${name}.webp`)),
)) {
  const source = resolve(item.source);
  const output = resolve(item.output);
  await mkdir(dirname(output), { recursive: true });
  const info = await sharp(source)
    .rotate()
    .resize(item.width, item.height, {
      fit: "cover",
      position: "centre",
      withoutEnlargement: true,
    })
    .webp({ quality: item.quality, effort: 6 })
    .toFile(output);
  const original = (await stat(source)).size;
  console.log(
    `${item.output}: ${info.width}×${info.height}, ${info.size} bytes (${(100 * (1 - info.size / original)).toFixed(1)}% smaller than source)`,
  );
}
