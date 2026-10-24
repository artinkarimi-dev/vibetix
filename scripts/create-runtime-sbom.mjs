import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const inventory = JSON.parse(
  await readFile("artifacts/preproduction/runtime-dependencies.json", "utf8"),
);
if (inventory.error)
  throw new Error("A successful pnpm runtime inventory is required.");
const components = new Map();
for (const [license, packages] of Object.entries(inventory))
  for (const pkg of packages)
    for (const version of pkg.versions) {
      const purl = `pkg:npm/${encodeURIComponent(pkg.name).replaceAll("%2F", "/")}@${encodeURIComponent(version)}`;
      components.set(purl, {
        type: "library",
        "bom-ref": purl,
        name: pkg.name,
        version,
        purl,
        licenses: [{ license: { name: license } }],
      });
    }
if (!components.size) throw new Error("Empty runtime inventory.");
await writeFile(
  "artifacts/preproduction/sbom.cdx.json",
  JSON.stringify(
    {
      bomFormat: "CycloneDX",
      specVersion: "1.6",
      serialNumber: `urn:uuid:${randomUUID()}`,
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        component: { type: "application", name: "VIBETIX", version: "0.1.0" },
        properties: [
          {
            name: "vibetix:scope",
            value:
              "pnpm workspace production component inventory; no container OS packages or dependency edges",
          },
        ],
      },
      components: [...components.values()].sort((a, b) =>
        a.purl.localeCompare(b.purl),
      ),
    },
    null,
    2,
  ),
);
console.info(
  `CycloneDX inventory generated: ${components.size} declared runtime components. Container OS coverage is unavailable.`,
);
