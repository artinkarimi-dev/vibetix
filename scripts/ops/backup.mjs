import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  open,
  mkdir,
  lstat,
  mkdtemp,
  rm,
  link,
  unlink,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { connect, target } from "./database.mjs";
async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
    throw new Error(
      "Backup directories must be private (0700) real directories.",
    );
}
async function keyBytes() {
  const path = process.env.BACKUP_KEY_FILE;
  if (!path) throw new Error("BACKUP_KEY_FILE is required.");
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
    throw new Error("Backup key must be a private regular file.");
  const file = await open(path, "r");
  try {
    const value = (await file.readFile("utf8")).trim();
    if (!/^[a-f0-9]{64}$/i.test(value))
      throw new Error(
        "Backup key must contain 32 random bytes encoded as hex.",
      );
    return Buffer.from(value, "hex");
  } finally {
    await file.close();
  }
}
async function postgresTool(tool, args, urlEnv) {
  const { url } = target(urlEnv),
    dir = await mkdtemp(join(tmpdir(), "vibetix-pgpass-"));
  await privateDirectory(dir);
  const escape = (value) => value.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
  const pass = join(dir, "pgpass");
  const file = await open(pass, "wx", 0o600);
  await file.writeFile(
    [
      url.hostname,
      url.port || "5432",
      decodeURIComponent(url.pathname.slice(1)),
      decodeURIComponent(url.username),
      decodeURIComponent(url.password),
    ]
      .map(escape)
      .join(":") + "\n",
  );
  await file.close();
  const tls = url.searchParams.get("sslmode") === "require";
  const child = spawn(
    process.env[tool === "pg_dump" ? "PG_DUMP_BIN" : "PG_RESTORE_BIN"] || tool,
    args,
    {
      stdio: ["ignore", tool === "pg_dump" ? "pipe" : "ignore", "ignore"],
      env: {
        ...process.env,
        PGPASSWORD: undefined,
        PGPASSFILE: pass,
        PGHOST: url.hostname,
        PGPORT: url.port || "5432",
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGUSER: decodeURIComponent(url.username),
        PGSSLMODE: tls ? "verify-full" : "disable",
      },
    },
  );
  const exit = new Promise((resolve) => {
    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return {
    child,
    exit,
    cleanup: async () => {
      stop();
      process.removeListener("SIGTERM", stop);
      process.removeListener("SIGINT", stop);
      await rm(dir, { recursive: true, force: true });
    },
  };
}
export async function backup(destination) {
  const t = target("BACKUP_DATABASE_URL");
  if (
    process.env.NODE_ENV === "production" &&
    t.url.searchParams.get("sslmode") !== "require"
  )
    throw new Error("Production backup requires TLS.");
  const key = await keyBytes();
  const path = resolve(destination);
  await privateDirectory(dirname(path));
  const partial = path + ".partial",
    file = await open(partial, "wx", 0o600);
  await file.close();
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  let tool;
  try {
    tool = await postgresTool(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-acl"],
      "BACKUP_DATABASE_URL",
    );
    async function* encrypted() {
      yield Buffer.concat([Buffer.from("VBTB1"), iv]);
      for await (const chunk of tool.child.stdout) yield cipher.update(chunk);
      yield cipher.final();
      yield cipher.getAuthTag();
    }
    await pipeline(
      Readable.from(encrypted()),
      createWriteStream(partial, { flags: "r+", mode: 0o600 }),
    );
    if (!(await tool.exit))
      throw new Error(
        "PostgreSQL backup failed; check tool version, permissions and connectivity.",
      );
    await link(partial, path);
    await unlink(partial);
    console.info("Encrypted backup created; no restore is implied.");
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  } finally {
    key.fill(0);
    await tool?.cleanup();
  }
}
export async function restore(source) {
  const t = target("RESTORE_DATABASE_URL");
  if (
    process.env.ALLOW_DATABASE_RESTORE !== "true" ||
    process.env.DATABASE_EXPECTED_NAME !== t.database
  )
    throw new Error(
      "Restore requires explicit authorization and an exact target database name.",
    );
  const db = await connect("RESTORE_DATABASE_URL");
  try {
    const result = await db.query(
      "SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 1",
    );
    if (result.rowCount)
      throw new Error(
        "Restore target must be empty; existing tables will not be dropped.",
      );
  } finally {
    await db.end();
  }
  const key = await keyBytes(),
    dir = await mkdtemp(join(tmpdir(), "vibetix-restore-"));
  await privateDirectory(dir);
  let tool;
  try {
    const file = await open(source, "r");
    const size = (await file.stat()).size;
    const header = Buffer.alloc(17),
      tag = Buffer.alloc(16);
    try {
      if (size < 33) throw new Error("Invalid backup.");
      await file.read(header, 0, 17, 0);
      await file.read(tag, 0, 16, size - 16);
    } finally {
      await file.close();
    }
    if (header.subarray(0, 5).toString() !== "VBTB1")
      throw new Error("Unsupported backup format.");
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(5));
    decipher.setAuthTag(tag);
    const archive = join(dir, "verified.dump");

    await pipeline(
      createReadStream(source, { start: 17, end: size - 17 }),
      decipher,
      createWriteStream(archive, { flags: "wx", mode: 0o600 }),
    );
    tool = await postgresTool(
      "pg_restore",
      [
        "--exit-on-error",
        "--single-transaction",
        "--no-owner",
        "--no-acl",
        "--dbname",
        t.database,
        archive,
      ],
      "RESTORE_DATABASE_URL",
    );
    if (!(await tool.exit))
      throw new Error(
        "PostgreSQL restore failed; transaction was not accepted.",
      );
    console.info(
      "Logical restore completed. Reapply roles/grants and validate application invariants before traffic.",
    );
  } finally {
    key.fill(0);
    await tool?.cleanup();
    await rm(dir, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  try {
    const [operation, path] = process.argv.slice(2);
    if (!path || !["backup", "restore"].includes(operation))
      throw new Error("Usage: backup.mjs backup|restore FILE");
    await (operation === "backup" ? backup(path) : restore(path));
  } catch {
    console.error(
      "Backup/restore failed. Check private paths, authorization, key, PostgreSQL tools, target and permissions. No credentials printed.",
    );
    process.exitCode = 1;
  }
}
