import pg from "pg";
import { readFile } from "node:fs/promises";
export function target(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${name}.`);
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || ["postgres", "template0", "template1"].includes(database))
    throw new Error("Use a dedicated application database.");
  return { value, url, database };
}
export async function connect(name) {
  const { url } = target(name);
  const tls = url.searchParams.get("sslmode") === "require";
  for (const key of [
    "schema",
    "connection_limit",
    "pool_timeout",
    "sslaccept",
    "sslcert",
    "sslmode",
  ])
    url.searchParams.delete(key);
  if (process.env.NODE_ENV === "production" && !tls)
    throw new Error("Production operations require verified PostgreSQL TLS.");
  const client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 5000,
    ...(tls
      ? {
          ssl: {
            rejectUnauthorized: true,
            ...(process.env.PGSSLROOTCERT
              ? { ca: await readFile(process.env.PGSSLROOTCERT, "utf8") }
              : {}),
          },
        }
      : {}),
  });
  await client.connect();
  return client;
}
export function requireOperation(name) {
  const { database } = target(name);
  if (
    process.env.ALLOW_DATABASE_ADMIN_OPERATION !== "true" ||
    process.env.DATABASE_EXPECTED_NAME !== database
  )
    throw new Error(
      "Explicit database operation authorization and matching DATABASE_EXPECTED_NAME are required.",
    );
  return database;
}
export const sqlIdentifier = pg.escapeIdentifier;
export const sqlLiteral = pg.escapeLiteral;
