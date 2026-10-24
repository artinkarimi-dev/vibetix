import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
export async function verifyMigrationState(query) {
  const files = (
    await readdir("backend/prisma/migrations", { withFileTypes: true })
  )
    .filter((x) => x.isDirectory())
    .map((x) => x.name)
    .sort();
  const applied = (
    await query(
      'SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations"',
    )
  ).filter((x) => !x.rolled_back_at);
  if (applied.length !== files.length)
    throw new Error("Migration state differs.");
  for (const name of files) {
    const checksum = createHash("sha256")
      .update(await readFile(`backend/prisma/migrations/${name}/migration.sql`))
      .digest("hex");
    if (
      !applied.some(
        (x) =>
          x.migration_name === name && x.finished_at && x.checksum === checksum,
      )
    )
      throw new Error("Missing, failed or altered migration.");
  }
  return files.length;
}
