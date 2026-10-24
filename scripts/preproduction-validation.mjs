import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID, createHash, createHmac } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  cp,
  rm,
  stat,
  access,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { resolve, join } from "node:path";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { Redis } from "ioredis";
import { PrismaClient } from "@prisma/client";
import { createDatabase } from "../backend/src/database/client.ts";
import { hotEventLoad } from "./hot-event-load.mjs";
import { inspectIntegrity } from "./ops/integrity.mjs";
import { backup, restore } from "./ops/backup.mjs";
const root = resolve("artifacts/preproduction");
await mkdir(root, { recursive: true });

await writeFile(
  join(root, "results.json"),
  JSON.stringify({
    passed: false,
    status: "running",
    startedAt: new Date().toISOString(),
  }) + "\n",
);
const privateRoot =
  process.env.VIBETIX_LAB_PRIVATE_ROOT ||
  (await mkdtemp(join(root, "private-")));
if (!privateRoot.startsWith(root + "/private-"))
  throw new Error("Invalid isolated lab directory.");
const cert = join(privateRoot, "server.crt"),
  key = join(privateRoot, "server.key"),
  ca = join(privateRoot, "ca.crt");
function command(args, env = process.env) {
  const r = spawnSync(process.execPath, args, { env, encoding: "utf8" });
  return r;
}
function openssl(args) {
  const r = spawnSync("openssl", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error("Local certificate generation failed.");
}
if (!process.argv.includes("--run")) {
  const qaTools = process.env.QA_OPS_TOOLS || "/tmp/vibetix-ops-tools/root";
  for (const [path, mode] of [
    [join(qaTools, "usr/bin/redis-server"), 1],
    [
      process.env.PG_DUMP_BIN ||
        join(qaTools, "usr/lib/postgresql/18/bin/pg_dump"),
      1,
    ],
    [
      process.env.PG_RESTORE_BIN ||
        join(qaTools, "usr/lib/postgresql/18/bin/pg_restore"),
      1,
    ],
    [
      process.env.QA_NGINX_EXECUTABLE ||
        "/tmp/vibetix-preproduction-tools/root/usr/sbin/nginx",
      1,
    ],
    [
      process.env.QA_NGINX_MIME_TYPES ||
        "/tmp/vibetix-preproduction-tools/root/etc/nginx/mime.types",
      4,
    ],
  ]) {
    try {
      await access(path, mode);
    } catch {
      throw new Error(
        `Native QA prerequisite unavailable: ${path}. See docs/PORTFOLIO_DEPLOYMENT.md.`,
      );
    }
  }
  for (const port of [
    21542, 21679, 23001, 23002, 23101, 23102, 23201, 23202, 22880, 22843, 3001,
    5188,
  ]) {
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", () =>
        reject(
          new Error(
            `Isolated lab port ${port} is already in use; existing services were not stopped.`,
          ),
        ),
      );
      server.listen(port, "127.0.0.1", () => server.close(resolve));
    });
  }
  openssl([
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(privateRoot, "ca.key"),
    "-out",
    ca,
    "-days",
    "2",
    "-subj",
    "/CN=VIBETIX isolated test CA",
  ]);
  openssl([
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    join(privateRoot, "server.csr"),
    "-subj",
    "/CN=localhost",
  ]);
  await writeFile(
    join(privateRoot, "extensions"),
    "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n",
  );
  openssl([
    "x509",
    "-req",
    "-in",
    join(privateRoot, "server.csr"),
    "-CA",
    ca,
    "-CAkey",
    join(privateRoot, "ca.key"),
    "-CAcreateserial",
    "-out",
    cert,
    "-days",
    "2",
    "-extfile",
    join(privateRoot, "extensions"),
  ]);
  openssl([
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(privateRoot, "wrong-ca.key"),
    "-out",
    join(privateRoot, "wrong-ca.crt"),
    "-days",
    "2",
    "-subj",
    "/CN=Untrusted test CA",
  ]);
  await writeFile(
    join(privateRoot, "wrong-host.ext"),
    "subjectAltName=DNS:wrong.invalid\nextendedKeyUsage=serverAuth\n",
  );
  openssl([
    "x509",
    "-req",
    "-in",
    join(privateRoot, "server.csr"),
    "-CA",
    ca,
    "-CAkey",
    join(privateRoot, "ca.key"),
    "-CAcreateserial",
    "-out",
    join(privateRoot, "wrong-host.crt"),
    "-days",
    "2",
    "-extfile",
    join(privateRoot, "wrong-host.ext"),
  ]);
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      ...process.execArgv.filter((x) => x === "--no-warnings"),
      "scripts/preproduction-validation.mjs",
      "--run",
    ],
    {
      env: {
        ...process.env,
        NODE_EXTRA_CA_CERTS: ca,
        VIBETIX_LAB_PRIVATE_ROOT: privateRoot,
      },
      stdio: "inherit",
    },
  );
  const code = await new Promise((r) => child.once("exit", r));
  process.exit(code ?? 1);
}
const checks = [],
  timings = [],
  children = new Set();
const privateValues = [];
const proxyHeaders = {};
const versions = {
  node: process.version,
  nginx: "native package (not the pinned container image)",
  docker: "unavailable",
  uid: process.getuid(),
};
assert.notEqual(versions.uid, 0, "Native services must execute without root");
const started = Date.now();
const record = (name) => {
  checks.push(name);
  console.info(`PASS ${name}`);
};
const credentials = {
  owner: randomBytes(32).toString("hex"),
  migrator: randomBytes(32).toString("hex"),
  runtime: randomBytes(32).toString("hex"),
  redis: randomBytes(32).toString("hex"),
  redisAdmin: randomBytes(32).toString("hex"),
};
const pgPort = 21542,
  redisPort = 21679,
  apiPort = 23001,
  simPort = 23002;
const tlsParams = new URLSearchParams({
  schema: "public",
  sslmode: "require",
  sslaccept: "strict",
  sslcert: ca,
  connection_limit: "5",
  connect_timeout: "3",
  pool_timeout: "3",
});
const dbUrl = (role, password, database = "vibetix_preproduction_demo_test") =>
  `postgresql://${role}:${password}@127.0.0.1:${pgPort}/${database}?${tlsParams}`;
const ownerUrl = dbUrl("vibetix", credentials.owner),
  migrationUrl = dbUrl("vibetix_migrator", credentials.migrator),
  runtimeUrl = dbUrl("vibetix_app", credentials.runtime);
const redisUrl = `rediss://limiter:${credentials.redis}@localhost:${redisPort}`;
const baseEnv = {
  ...process.env,
  DATABASE_URL: runtimeUrl,
  MIGRATION_DATABASE_URL: migrationUrl,
  PGSSLROOTCERT: ca,
  NODE_EXTRA_CA_CERTS: ca,
  TICKET_SIGNING_KEY: randomBytes(48).toString("hex"),
  ABUSE_KEY_SECRET: randomBytes(32).toString("hex"),
  NODE_ENV: "test",
  APP_MODE: "commercial",
  RATE_LIMIT_BACKEND: "redis",
  REDIS_URL: redisUrl,
  EMAIL_TRANSPORT: "disabled",
  ALLOW_SIMULATED_PAYMENTS: "true",
  HOST: "127.0.0.1",
  GLOBAL_RATE_LIMIT: "50000",
  AUTH_IP_LIMIT: "100",
  AUTH_IDENTITY_LIMIT: "100",
  ALLOW_DATABASE_TESTS: "true",
  PORT: String(simPort),
  APP_ORIGIN: `http://127.0.0.1:${simPort}`,
};
const ld =
  process.env.QA_NATIVE_LIBRARY_PATH ||
  resolve(
    "node_modules/.pnpm/@embedded-postgres+linux-x64@18.4.0-beta.17/node_modules/@embedded-postgres/linux-x64/native/lib",
  );
baseEnv.LD_LIBRARY_PATH = ld;
const tools = process.env.QA_OPS_TOOLS || "/tmp/vibetix-ops-tools/root";
baseEnv.PG_DUMP_BIN =
  process.env.PG_DUMP_BIN || join(tools, "usr/lib/postgresql/18/bin/pg_dump");
baseEnv.PG_RESTORE_BIN =
  process.env.PG_RESTORE_BIN ||
  join(tools, "usr/lib/postgresql/18/bin/pg_restore");
function service(name, exe, args, env = baseEnv) {
  const file = createWriteStream(join(privateRoot, `${name}.log`), {
    flags: "a",
    mode: 0o600,
  });
  const child = spawn(exe, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  child.stdout.pipe(file, { end: false });
  child.stderr.pipe(file, { end: false });
  child.once("exit", () => {
    children.delete(child);
    file.end();
  });
  child.once("error", () => file.end());
  return child;
}
async function stop(child, signal = "SIGTERM") {
  if (!child || child.exitCode !== null || child.signalCode) return;
  const done = new Promise((r) => child.once("exit", (code) => r(code)));
  child.kill(signal);
  const code = await Promise.race([
    done,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Service shutdown timed out.")),
        20000,
      ).unref(),
    ),
  ]);
  assert.equal(code, 0, "Graceful shutdown must exit zero");
}
async function until(fn, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if (await fn()) return;
    } catch {
      /* Expected transient startup/shutdown probe failure. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Infrastructure condition timed out.");
}
function run(name, args, env = baseEnv, success = true) {
  const r = command(args, env);
  return writeFile(
    join(root, `${name}.log`),
    (r.stdout || "") + (r.stderr || ""),
    { mode: 0o600 },
  ).then(() => {
    if (success)
      assert.equal(
        r.status,
        0,
        `${name} failed; inspect restricted local evidence`,
      );
    else assert.notEqual(r.status, 0);
    return r;
  });
}
const origin = `http://127.0.0.1:${simPort}`;
async function http(
  path,
  { method = "GET", body, cookie = "", port = simPort, headers = {} } = {},
) {
  const start = performance.now(),
    r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        origin: port === apiPort ? "https://localhost:22843" : origin,
        ...(cookie ? { cookie } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return {
    status: r.status,
    data,
    headers: r.headers,
    milliseconds: performance.now() - start,
  };
}
const api = (path, options = {}) => http("/api/v1" + path, options);
async function account() {
  const email = `infra-${randomUUID()}@example.test`,
    password = "Lab-" + randomBytes(24).toString("hex");
  assert.equal(
    (
      await api("/auth/register", {
        method: "POST",
        body: {
          email,
          password,
          firstName: "Infrastructure",
          lastName: "Test",
        },
      })
    ).status,
    201,
  );
  const response = await api("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(response.status, 200);
  privateValues.push(
    email,
    password,
    response.headers.get("set-cookie").split(";")[0].split("=")[1],
  );
  return {
    email,
    password,
    id: response.data.user.id,
    cookie: response.headers.get("set-cookie").split(";")[0],
  };
}
const hold = (a, ids) =>
  api("/events/echoes-new-york/hold-seats", {
    method: "POST",
    cookie: a.cookie,
    body: { seatIds: ids },
  });
const orderBody = (a, ids) => ({
  eventId: "echoes-new-york",
  seatIds: ids,
  extras: {},
  promo: "",
  attendee: {
    fullName: "Infrastructure Test",
    email: a.email,
    phone: "+1 212 555 0100",
  },
  deliveryMethod: "mobile",
  paymentOutcome: "success",
});
const postgres = new EmbeddedPostgres({
  databaseDir: join(privateRoot, "pgdata"),
  port: pgPort,
  user: "vibetix",
  password: credentials.owner,
  authMethod: "scram-sha-256",
  persistent: true,
  postgresFlags: [
    "-h",
    "127.0.0.1",
    "-c",
    "ssl=on",
    "-c",
    `ssl_cert_file=${cert}`,
    "-c",
    `ssl_key_file=${key}`,
  ],
  onLog: () => {},
  onError: () => {},
});
let owner,
  runtime,
  redisAdmin,
  redis,
  mainApi,
  simApi,
  worker,
  nginx,
  pgRunning = false;
try {
  await postgres.initialise();
  await postgres.start();
  pgRunning = true;
  await postgres.createDatabase("vibetix_preproduction_demo_test");
  owner = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
  const provisioning = {
    ...baseEnv,
    DATABASE_ADMIN_URL: ownerUrl,
    DATABASE_EXPECTED_NAME: "vibetix_preproduction_demo_test",
    ALLOW_DATABASE_ADMIN_OPERATION: "true",
  };
  await run(
    "roles-initial",
    ["scripts/ops/database-security.mjs", "roles"],
    provisioning,
  );
  await run("forward-migration", ["scripts/ops/migrate.mjs"]);
  await run("seed", ["--import", "tsx", "backend/prisma/seed.ts"], {
    ...baseEnv,
    DATABASE_URL: migrationUrl,
  });
  await run("grants", ["scripts/ops/database-security.mjs"], provisioning);
  runtime = createDatabase({ DATABASE_URL: runtimeUrl });
  await run("database-preflight", ["scripts/ops/preflight.mjs"], {
    ...baseEnv,
    NODE_ENV: "production",
  });
  await run(
    "preflight-reject-runtime-migrator",
    ["scripts/ops/preflight.mjs"],
    { ...baseEnv, MIGRATION_DATABASE_URL: runtimeUrl },
    false,
  );
  const [ssl] =
    await runtime.$queryRaw`SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()`;
  assert.equal(ssl.ssl, true);
  versions.postgres = (
    await runtime.$queryRaw`SELECT version() AS version`
  )[0].version;
  const badUrl = new URL(runtimeUrl);
  badUrl.searchParams.set("sslcert", join(privateRoot, "wrong-ca.crt"));
  const untrusted = createDatabase({ DATABASE_URL: badUrl.toString() });
  try {
    await assert.rejects(untrusted.$queryRaw`SELECT 1`);
  } finally {
    await untrusted.$disconnect();
  }
  const validCertificate = await readFile(cert);
  await cp(join(privateRoot, "wrong-host.crt"), cert);
  await owner.$queryRaw`SELECT pg_reload_conf()`;
  await new Promise((r) => setTimeout(r, 300));
  const wrongHost = createDatabase({ DATABASE_URL: runtimeUrl });
  try {
    await assert.rejects(wrongHost.$queryRaw`SELECT 1`);
  } finally {
    await wrongHost.$disconnect();
    await writeFile(cert, validCertificate);
    await owner.$queryRaw`SELECT pg_reload_conf()`;
    await new Promise((r) => setTimeout(r, 300));
  }
  record(
    "Forward migrations as non-superuser migrator; runtime PostgreSQL TLS and wrong-CA/wrong-hostname rejection",
  );
  const restricted = new pg.Client({
    connectionString: runtimeUrl.split("?")[0],
    ssl: { rejectUnauthorized: true, ca: await readFile(ca, "utf8") },
  });
  await restricted.connect();
  try {
    for (const sql of [
      "CREATE ROLE preproduction_forbidden",
      "CREATE DATABASE preproduction_forbidden",
      "ALTER SCHEMA public RENAME TO preproduction_forbidden",
      "CREATE TABLE public.preproduction_forbidden(id int)",
      'DROP TABLE "AuditLog"',
      "UPDATE \"AuditLog\" SET action='TAMPERED'",
      'DELETE FROM "AuditLog"',
      'SELECT * FROM "_prisma_migrations"',
    ]) {
      const transactional = !sql.startsWith("CREATE DATABASE");
      if (transactional) await restricted.query("BEGIN");
      try {
        await assert.rejects(restricted.query(sql), (e) => e.code === "42501");
      } finally {
        if (transactional) await restricted.query("ROLLBACK");
      }
    }
    assert.equal(
      (await restricted.query("SHOW statement_timeout")).rows[0]
        .statement_timeout,
      "15s",
    );
    assert.equal(
      (await restricted.query("SHOW idle_in_transaction_session_timeout"))
        .rows[0].idle_in_transaction_session_timeout,
      "20s",
    );
  } finally {
    await restricted.end();
  }
  await run(
    "runtime-migration-denied",
    ["scripts/ops/migrate.mjs"],
    { ...baseEnv, MIGRATION_DATABASE_URL: runtimeUrl },
    false,
  );
  record(
    "Runtime denies role/database/schema/table/history/migration authority with permission errors; role timeouts active",
  );
  const acl = join(privateRoot, "redis.acl");
  await writeFile(
    acl,
    `user default off\nuser limiter on #${createHash("sha256").update(credentials.redis).digest("hex")} ~vibetix:abuse:v1:* +ping +info +eval +incr +pexpire +pttl +client|setname\nuser validator on #${createHash("sha256").update(credentials.redisAdmin).digest("hex")} ~* +@all\n`,
    { mode: 0o600 },
  );
  const redisExe = join(tools, "usr/bin/redis-server"),
    redisArgs = [
      "--bind",
      "127.0.0.1",
      "--port",
      "0",
      "--tls-port",
      String(redisPort),
      "--tls-cert-file",
      cert,
      "--tls-key-file",
      key,
      "--tls-ca-cert-file",
      ca,
      "--tls-auth-clients",
      "no",
      "--aclfile",
      acl,
      "--save",
      "",
      "--appendonly",
      "no",
    ];
  const redisEnv = {
    ...baseEnv,
    LD_LIBRARY_PATH: join(tools, "usr/lib/x86_64-linux-gnu"),
  };
  const startRedis = () => service("redis", redisExe, redisArgs, redisEnv);
  redis = startRedis();
  redisAdmin = new Redis(
    `rediss://validator:${credentials.redisAdmin}@localhost:${redisPort}`,
    { maxRetriesPerRequest: 1, connectTimeout: 1000 },
  );
  redisAdmin.on("error", () => {});
  await until(async () => (await redisAdmin.ping()) === "PONG");
  versions.redis = /redis_version:([^\r\n]+)/.exec(
    await redisAdmin.info("server"),
  )[1];
  const unauthorized = new Redis(
    `rediss://limiter:wrong-password@localhost:${redisPort}`,
    { lazyConnect: true, retryStrategy: () => null },
  );
  unauthorized.on("error", () => {});
  try {
    await assert.rejects(unauthorized.connect());
  } finally {
    unauthorized.disconnect();
  }
  const wrongTls = new Redis(redisUrl, {
    lazyConnect: true,
    retryStrategy: () => null,
    tls: { ca: await readFile(join(privateRoot, "wrong-ca.crt"), "utf8") },
  });
  wrongTls.on("error", () => {});
  try {
    await assert.rejects(wrongTls.connect());
  } finally {
    wrongTls.disconnect();
  }
  record(
    "Real authenticated TLS Redis with restricted application ACL; bad password and wrong CA rejected",
  );
  const secretFiles = {
    DATABASE_URL: runtimeUrl,
    REDIS_URL: redisUrl,
    TICKET_SIGNING_KEY: baseEnv.TICKET_SIGNING_KEY,
    ABUSE_KEY_SECRET: baseEnv.ABUSE_KEY_SECRET,
  };
  const prodEnv = {
    ...baseEnv,
    NODE_ENV: "production",
    ALLOW_SIMULATED_PAYMENTS: "false",
    APP_ORIGIN: "https://localhost:22843",
    TRUSTED_PROXY_CIDRS: "127.0.0.1/32",
    PORT: String(apiPort),
  };
  for (const [name, value] of Object.entries(secretFiles)) {
    const path = join(privateRoot, name);
    await writeFile(path, value, { mode: 0o600 });
    delete prodEnv[name];
    prodEnv[name + "_FILE"] = path;
  }
  const startMain = () =>
    service(
      "api-production",
      process.execPath,
      ["backend/dist/backend/src/server.js"],
      prodEnv,
    );
  mainApi = startMain();
  simApi = service("api-simulation", process.execPath, [
    "backend/dist/backend/src/server.js",
  ]);
  await until(
    async () => (await http("/ready", { port: apiPort })).status === 200,
  );
  await until(async () => (await http("/ready")).status === 200);
  record(
    "Compiled production API starts with mounted-file secrets, strict DB TLS, Redis TLS and restricted runtime credentials",
  );
  const nginxExe =
    process.env.QA_NGINX_EXECUTABLE ||
    "/tmp/vibetix-preproduction-tools/root/usr/sbin/nginx";
  let template = await readFile("frontend/https.conf.example", "utf8");
  template = template
    .replace("listen 8080;", "listen 127.0.0.1:22880;")
    .replace("listen 8443 ssl;", "listen 127.0.0.1:22843 ssl;")
    .replaceAll("tickets.example.invalid", "localhost")
    .replace(
      "https://localhost$request_uri",
      "https://localhost:22843$request_uri",
    )
    .replace("/run/secrets/tls_certificate", cert)
    .replace("/run/secrets/tls_private_key", key)
    .replace("/usr/share/nginx/html", resolve("dist"))
    .replace("http://backend:3001", `http://127.0.0.1:${apiPort}`)
    .replaceAll("/tmp/client_body", join(privateRoot, "client_body"))
    .replaceAll("/tmp/proxy", join(privateRoot, "proxy"))
    .replaceAll("/tmp/fastcgi", join(privateRoot, "fastcgi"))
    .replaceAll("/tmp/uwsgi", join(privateRoot, "uwsgi"))
    .replaceAll("/tmp/scgi", join(privateRoot, "scgi"));
  const nginxFile = join(privateRoot, "nginx.conf");
  await writeFile(
    nginxFile,
    `pid ${join(privateRoot, "nginx.pid")};\nerror_log ${join(privateRoot, "nginx-error.log")};\nevents {}\nhttp { access_log off; include ${process.env.QA_NGINX_MIME_TYPES || "/tmp/vibetix-preproduction-tools/root/etc/nginx/mime.types"}; ${template} }\n`,
  );
  const syntax = spawnSync(nginxExe, ["-t", "-c", nginxFile], {
    encoding: "utf8",
  });
  await writeFile(
    join(root, "nginx-syntax.log"),
    (syntax.stdout || "") + (syntax.stderr || ""),
  );
  assert.equal(syntax.status, 0);
  versions.nginx = spawnSync(nginxExe, ["-v"], {
    encoding: "utf8",
  }).stderr.trim();
  nginx = service("nginx", nginxExe, ["-c", nginxFile, "-g", "daemon off;"]);
  const trustedCa = await readFile(ca);
  async function tls(
    path,
    {
      method = "GET",
      body,
      cookie = "",
      headers = {},
      authority = trustedCa,
    } = {},
  ) {
    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        {
          hostname: "localhost",
          port: 22843,
          path,
          method,
          ca: authority,
          lookup: (_h, _o, cb) =>
            cb(null, [{ address: "127.0.0.1", family: 4 }]),
          headers: {
            origin: "https://localhost:22843",
            ...(body ? { "content-type": "application/json" } : {}),
            ...(cookie ? { cookie } : {}),
            ...headers,
          },
        },
        (res) => {
          let raw = "";
          res.on("data", (chunk) => (raw += chunk));
          res.on("end", () => {
            let data;
            try {
              data = JSON.parse(raw);
            } catch {
              /* Expected transient startup/shutdown probe failure. */
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              raw,
              data,
            });
          });
        },
      );
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
  await until(async () => (await tls("/")).status === 200);
  const redirect = await new Promise((resolve, reject) => {
    httpRequest("http://127.0.0.1:22880/events?test=1", (res) => {
      res.resume();
      resolve({ status: res.statusCode, location: res.headers.location });
    })
      .on("error", reject)
      .end();
  });
  assert.deepEqual(redirect, {
    status: 308,
    location: "https://localhost:22843/events?test=1",
  });
  await assert.rejects(
    tls("/", { authority: await readFile(join(privateRoot, "wrong-ca.crt")) }),
  );
  const home = await tls("/");
  for (const header of [
    "strict-transport-security",
    "content-security-policy",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "x-frame-options",
  ])
    assert.ok(home.headers[header]);
  const catalog = await tls("/api/v1/catalog", {
    headers: { "x-forwarded-for": "203.0.113.123" },
  });
  assert.equal(catalog.status, 200);
  const globalKey = (ip) =>
    `vibetix:abuse:v1:global:${createHmac("sha256", baseEnv.ABUSE_KEY_SECRET).update(ip).digest("hex")}`;
  assert.equal(await redisAdmin.exists(globalKey("127.0.0.1")), 1);
  assert.equal(
    await redisAdmin.exists(globalKey("203.0.113.123")),
    0,
    "nginx must overwrite spoofed forwarding headers",
  );
  await new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        localAddress: "127.0.0.2",
        port: apiPort,
        path: "/api/v1/catalog",
        headers: { "x-forwarded-for": "203.0.113.123" },
      },
      (response) => {
        response.resume();
        response.on("end", resolve);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(await redisAdmin.exists(globalKey("127.0.0.2")), 1);
  assert.equal(await redisAdmin.exists(globalKey("203.0.113.123")), 0);
  assert.equal(catalog.headers["cache-control"], "no-store");
  for (const name of [
    "strict-transport-security",
    "content-security-policy",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "x-frame-options",
    "cache-control",
  ])
    proxyHeaders[name] = {
      frontend: home.headers[name],
      api: catalog.headers[name],
    };
  for (const name of [
    "strict-transport-security",
    "content-security-policy",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "x-frame-options",
  ])
    assert.equal(
      catalog.headers[name],
      home.headers[name],
      `edge owns ${name}`,
    );
  const asset = /src="([^"]+\.js)"/.exec(home.raw)[1];
  assert.match(
    String((await tls(asset)).headers["cache-control"]),
    /immutable/,
  );
  assert.equal(
    (
      await tls("/api/v1/auth/login", {
        method: "POST",
        body: { padding: "x".repeat(40000) },
      })
    ).status,
    413,
  );
  record(
    "Native nginx syntax/runtime: verified local CA TLS, HTTPS redirect, security/cache headers, forwarding and body cap",
  );
  const productionEmail = `production-${randomUUID()}@example.test`,
    password = "TLS-" + randomBytes(24).toString("hex");
  assert.equal(
    (
      await tls("/api/v1/auth/register", {
        method: "POST",
        body: {
          email: productionEmail,
          password,
          firstName: "Local",
          lastName: "TLS",
        },
      })
    ).status,
    201,
  );
  const login = await tls("/api/v1/auth/login", {
    method: "POST",
    body: { email: productionEmail, password },
  });
  assert.equal(login.status, 200);
  const secureCookie = login.headers["set-cookie"][0];
  assert.match(secureCookie, /__Host-vibetix=/);
  assert.match(secureCookie, /; Secure/);
  assert.match(secureCookie, /; HttpOnly/);
  const prodCookie = secureCookie.split(";")[0];
  privateValues.push(productionEmail, password, prodCookie.split("=")[1]);
  const seat = await runtime.eventSeat.findFirstOrThrow({
    where: { eventId: "echoes-new-york", status: "AVAILABLE" },
  });
  assert.equal(
    (
      await tls("/api/v1/events/echoes-new-york/hold-seats", {
        method: "POST",
        cookie: prodCookie,
        body: { seatIds: [seat.id] },
      })
    ).status,
    200,
  );
  const before = await runtime.order.count();
  const denied = await tls("/api/v1/orders", {
    method: "POST",
    cookie: prodCookie,
    headers: { "idempotency-key": randomUUID() },
    body: orderBody({ email: productionEmail }, [seat.id]),
  });
  assert.equal(denied.status, 503);
  assert.equal(denied.data.error.code, "PAYMENTS_DISABLED");
  assert.equal(await runtime.order.count(), before);
  assert.equal(
    (await tls("/api/v1/admin/orders", { cookie: prodCookie })).status,
    403,
  );
  await tls("/api/v1/events/echoes-new-york/hold-seats", {
    method: "POST",
    cookie: prodCookie,
    body: { seatIds: [] },
  });
  record(
    "HTTPS registration/login with Secure host cookie; production simulated order rejected without fulfillment",
  );
  await stop(mainApi);
  prodEnv.APP_MODE = "portfolio";
  mainApi = startMain();
  await until(
    async () => (await http("/ready", { port: apiPort })).status === 200,
  );
  const demoSeat = await runtime.eventSeat.findFirstOrThrow({
    where: { eventId: "echoes-new-york", status: "AVAILABLE" },
  });
  assert.equal(
    (
      await tls("/api/v1/events/echoes-new-york/hold-seats", {
        method: "POST",
        cookie: prodCookie,
        body: { seatIds: [demoSeat.id] },
      })
    ).status,
    200,
  );
  const demoKey = randomUUID(),
    demoBody = orderBody({ email: productionEmail }, [demoSeat.id]);
  const demoOrder = await tls("/api/v1/orders", {
    method: "POST",
    cookie: prodCookie,
    headers: { "idempotency-key": demoKey },
    body: demoBody,
  });
  assert.equal(demoOrder.status, 201);
  assert.equal(demoOrder.data.order.simulation, true);
  assert.equal(
    (
      await runtime.payment.findUniqueOrThrow({
        where: { orderId: demoOrder.data.order.id },
      })
    ).provider,
    "portfolio-demo",
  );
  const demoReplay = await tls("/api/v1/orders", {
    method: "POST",
    cookie: prodCookie,
    headers: { "idempotency-key": demoKey },
    body: demoBody,
  });
  assert.equal(demoReplay.data.order.id, demoOrder.data.order.id);
  assert.equal(
    (await tls("/api/v1/admin/orders", { cookie: prodCookie })).status,
    403,
  );
  await stop(mainApi);
  prodEnv.APP_MODE = "commercial";
  mainApi = startMain();
  await until(
    async () => (await http("/ready", { port: apiPort })).status === 200,
  );
  record(
    "Explicit portfolio mode on compiled production API: HTTPS, restricted DB/Redis, demo-only order and replay, admin MFA still denied; commercial mode restored",
  );
  const a = await account(),
    b = await account();
  assert.equal(
    (
      await api("/favorites", {
        method: "POST",
        cookie: a.cookie,
        body: { eventId: "echoes-new-york" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await api("/favorites", { cookie: a.cookie })).data.favorites.length,
    1,
  );
  assert.equal(
    (await api("/tickets", { cookie: "vibetix-session=forged" })).status,
    401,
  );
  const raceSeat = await runtime.eventSeat.findFirstOrThrow({
    where: { eventId: "echoes-new-york", status: "AVAILABLE" },
  });
  const race = await Promise.all([
    hold(a, [raceSeat.id]),
    hold(b, [raceSeat.id]),
  ]);
  assert.equal(race.filter((r) => r.status === 200).length, 1);
  assert.equal(race.filter((r) => r.status === 409).length, 1);
  const winner = race[0].status === 200 ? a : b,
    idempotency = randomUUID();
  const [first, duplicate] = await Promise.all([
    api("/orders", {
      method: "POST",
      cookie: winner.cookie,
      headers: { "idempotency-key": idempotency },
      body: orderBody(winner, [raceSeat.id]),
    }),
    api("/orders", {
      method: "POST",
      cookie: winner.cookie,
      headers: { "idempotency-key": idempotency },
      body: orderBody(winner, [raceSeat.id]),
    }),
  ]);
  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 201);
  assert.equal(first.data.order.id, duplicate.data.order.id);
  assert.equal(
    (await api(`/orders/${first.data.order.id}`, { cookie: winner.cookie }))
      .status,
    200,
  );
  assert.equal(
    (
      await api(`/orders/${first.data.order.id}`, {
        cookie: winner === a ? b.cookie : a.cookie,
      })
    ).status,
    404,
  );
  record(
    "Restricted-role favorites, invalid session, two-user race, duplicate idempotent sale and order ownership",
  );
  const budgets = {
    ...baseEnv,
    AUTH_IDENTITY_LIMIT: "2",
    HOLD_RATE_LIMIT: "2",
    CHECKOUT_RATE_LIMIT: "2",
  };
  const one = service(
    "budget-one",
    process.execPath,
    ["backend/dist/backend/src/server.js"],
    { ...budgets, PORT: "23101" },
  );
  const two = service(
    "budget-two",
    process.execPath,
    ["backend/dist/backend/src/server.js"],
    { ...budgets, PORT: "23102" },
  );
  try {
    await until(
      async () => (await http("/ready", { port: 23101 })).status === 200,
    );
    await until(
      async () => (await http("/ready", { port: 23102 })).status === 200,
    );
    for (const operation of ["login", "register"]) {
      const email = `budget-${randomUUID()}@example.test`,
        body = {
          email,
          password: "Budget-" + randomBytes(20).toString("hex"),
          ...(operation === "register"
            ? { firstName: "Budget", lastName: "Test" }
            : {}),
        };
      for (let index = 0; index < 3; index++) {
        const response = await http(`/api/v1/auth/${operation}`, {
          port: index === 1 ? 23102 : 23101,
          method: "POST",
          body,
        });
        assert.equal(
          response.status,
          index === 2 ? 429 : operation === "login" ? 401 : 201,
        );
      }
    }
    const c = await account();
    for (const path of ["/events/echoes-new-york/hold-seats", "/orders"]) {
      for (let index = 0; index < 3; index++) {
        const response = await http("/api/v1" + path, {
          port: index === 1 ? 23102 : 23101,
          method: "POST",
          cookie: c.cookie,
          body: path.endsWith("hold-seats") ? { seatIds: [] } : {},
        });
        assert.equal(
          response.status,
          index === 2 ? 429 : path.endsWith("hold-seats") ? 200 : 400,
        );
      }
    }
    const keys = await redisAdmin.keys("vibetix:abuse:v1:*");
    for (const name of keys) {
      assert.ok(!name.includes(c.email));
      const ttl = await redisAdmin.pttl(name);
      assert.ok(ttl > 0 && ttl <= 900000);
    }
  } finally {
    await stop(one);
    await stop(two);
  }
  record(
    "Login, registration, hold and checkout budgets shared by two real API processes; HMAC namespaces and bounded TTLs checked",
  );
  for (let sample = 0; sample < 3; sample++) {
    for (const path of ["/catalog", "/events/echoes-new-york/availability"]) {
      const result = await api(path);
      assert.equal(result.status, 200);
      timings.push({ operation: path, milliseconds: result.milliseconds });
    }
    const s = await runtime.eventSeat.findFirstOrThrow({
      where: { eventId: "echoes-new-york", status: "AVAILABLE" },
    });
    const held = await hold(a, [s.id]);
    assert.equal(held.status, 200);
    timings.push({ operation: "hold", milliseconds: held.milliseconds });
    const quote = await api("/quotes", {
      method: "POST",
      cookie: a.cookie,
      body: {
        eventId: "echoes-new-york",
        seatIds: [s.id],
        extras: {},
        promo: "VIBETIX10",
      },
    });
    assert.equal(quote.status, 200);
    timings.push({ operation: "quote", milliseconds: quote.milliseconds });
    const sale = await api("/orders", {
      method: "POST",
      cookie: a.cookie,
      headers: { "idempotency-key": randomUUID() },
      body: orderBody(a, [s.id]),
    });
    assert.equal(sale.status, 201);
    timings.push({
      operation: "simulated order",
      milliseconds: sale.milliseconds,
    });
  }
  const drainingSeat = await runtime.eventSeat.findFirstOrThrow({
    where: { eventId: "echoes-new-york", status: "AVAILABLE" },
  });
  await hold(a, [drainingSeat.id]);
  let releaseSale, saleLocked;
  const saleLockReady = new Promise((r) => {
      saleLocked = r;
    }),
    saleRelease = new Promise((r) => {
      releaseSale = r;
    });
  const saleLock = owner.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id='echoes-new-york' FOR UPDATE`;
      saleLocked();
      await saleRelease;
    },
    { timeout: 15000 },
  );
  await saleLockReady;
  const drainKey = randomUUID(),
    pendingSale = api("/orders", {
      method: "POST",
      cookie: a.cookie,
      headers: { "idempotency-key": drainKey },
      body: orderBody(a, [drainingSeat.id]),
    });
  try {
    await until(
      async () =>
        Number(
          (
            await owner.$queryRaw`SELECT count(*) AS n FROM pg_stat_activity WHERE usename='vibetix_app' AND wait_event_type='Lock'`
          )[0].n,
        ) > 0,
      6000,
    );
    const exited = new Promise((r) => simApi.once("exit", r));
    simApi.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(simApi.exitCode, null);
    const newRequest = await http("/live").then(
      (r) => r.status,
      () => 0,
    );
    assert.ok([0, 503].includes(newRequest));
    releaseSale();
    await saleLock;
    const settled = await pendingSale;
    assert.equal(settled.status, 201);
    assert.equal(await exited, 0);
    simApi = service("api-simulation", process.execPath, [
      "backend/dist/backend/src/server.js",
    ]);
    await until(async () => (await http("/ready")).status === 200);
    const replay = await api("/orders", {
      method: "POST",
      cookie: a.cookie,
      headers: { "idempotency-key": drainKey },
      body: orderBody(a, [drainingSeat.id]),
    });
    assert.equal(replay.status, 201);
    assert.equal(replay.data.order.id, settled.data.order.id);
  } finally {
    releaseSale();
    await saleLock;
  }
  record(
    "API SIGTERM refuses new requests, drains an in-flight checkout and preserves idempotency after restart",
  );
  const expirySeat = await runtime.eventSeat.findFirstOrThrow({
    where: { eventId: "echoes-new-york", status: "AVAILABLE" },
  });
  await hold(a, [expirySeat.id]);
  await runtime.seatHold.update({
    where: { eventSeatId: expirySeat.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(
    (
      await runtime.eventSeat.findUniqueOrThrow({
        where: { id: expirySeat.id },
      })
    ).status,
    "HELD",
  );
  let releaseLock, lockAcquired;
  const readyLock = new Promise((r) => {
    lockAcquired = r;
  });
  const released = new Promise((r) => {
    releaseLock = r;
  });
  const blocked = owner.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id='echoes-new-york' FOR UPDATE`;
      lockAcquired();
      await released;
    },
    { timeout: 15000 },
  );
  await readyLock;
  worker = service("worker", process.execPath, [
    "backend/dist/backend/src/worker.js",
  ]);
  try {
    await until(
      async () =>
        Number(
          (
            await owner.$queryRaw`SELECT count(*) AS n FROM pg_stat_activity WHERE usename='vibetix_app' AND wait_event_type='Lock'`
          )[0].n,
        ) > 0,
      6000,
    );
    const exited = new Promise((r) => worker.once("exit", r));
    worker.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(
      worker.exitCode,
      null,
      "Worker must drain the active transaction",
    );
    releaseLock();
    await blocked;
    assert.equal(await exited, 0);
    assert.equal(
      (
        await runtime.eventSeat.findUniqueOrThrow({
          where: { id: expirySeat.id },
        })
      ).status,
      "AVAILABLE",
    );
  } finally {
    releaseLock();
    await blocked;
  }
  worker = null;
  record(
    "Stopped worker leaves expired hold persisted; SIGTERM drains a lock-blocked expiry transaction and exits cleanly",
  );
  await stop(redis);
  redis = null;
  await until(
    async () => (await http("/ready", { port: apiPort })).status === 503,
  );
  assert.equal((await http("/live", { port: apiPort })).status, 200);
  assert.equal((await api("/catalog")).status, 503);
  const soldBefore = await runtime.order.count();
  assert.equal(
    (
      await api("/orders", {
        method: "POST",
        cookie: a.cookie,
        headers: { "idempotency-key": randomUUID() },
        body: orderBody(a, [expirySeat.id]),
      })
    ).status,
    503,
  );
  assert.equal(await runtime.order.count(), soldBefore);
  redis = startRedis();
  await until(
    async () => (await http("/ready", { port: apiPort })).status === 200,
  );
  assert.equal((await api("/catalog")).status, 200);
  record(
    "Real Redis process outage: liveness 200/readiness 503, fail-closed checkout, no new order and automatic recovery",
  );
  await stop(mainApi);
  mainApi = startMain();
  await until(
    async () => (await http("/ready", { port: apiPort })).status === 200,
  );
  assert.equal(
    (await tls("/api/v1/auth/me", { cookie: prodCookie })).data.user.email,
    productionEmail,
  );
  record(
    "API SIGTERM/restart closes cleanly and preserves PostgreSQL-backed session",
  );
  const failedPath = await mkdtemp(join(privateRoot, "failed-migration-"));
  await cp("backend/prisma", failedPath, { recursive: true });
  await mkdir(join(failedPath, "migrations/20990101000000_failure_probe"));
  await writeFile(
    join(failedPath, "migrations/20990101000000_failure_probe/migration.sql"),
    "BEGIN; CREATE TABLE failure_probe(id int); SELECT 1/0; COMMIT;",
  );
  await run(
    "failed-migration",
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      join(failedPath, "schema.prisma"),
    ],
    { ...baseEnv, DATABASE_URL: migrationUrl },
    false,
  );
  const [probe] =
    await owner.$queryRaw`SELECT to_regclass('public.failure_probe')::text AS name`;
  assert.equal(probe.name, null);
  await run(
    "failed-migration-resolve",
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "resolve",
      "--rolled-back",
      "20990101000000_failure_probe",
      "--schema",
      join(failedPath, "schema.prisma"),
    ],
    { ...baseEnv, DATABASE_URL: migrationUrl },
  );
  await run("migration-recovery", ["scripts/ops/migrate.mjs"]);
  record(
    "Failed additive migration rolls back DDL; recorded failure resolved as rolled back; real migration workflow recovers",
  );
  await run("existing-backend-tests", ["scripts/verify-production.mjs"], {
    ...baseEnv,
    DATABASE_URL: ownerUrl,
    REDIS_TEST_URL: redisUrl,
    REDIS_TEST_INSPECT_URL: `rediss://validator:${credentials.redisAdmin}@localhost:${redisPort}`,
  });
  await run(
    "demo-reset-regression",
    ["--import", "tsx", "scripts/verify-demo-reset.mjs"],
    { ...baseEnv, DATABASE_URL: ownerUrl },
  );
  record(
    "Dedicated portfolio reset database: guarded offline reset, non-demo payment refusal, dry-run, preserved migrations and future reseed verified",
  );

  await run(
    "restore-test-role-credentials",
    ["scripts/ops/database-security.mjs"],
    { ...provisioning, ROTATE_DATABASE_ROLE_PASSWORDS: "true" },
  );
  await runtime.$disconnect();
  runtime = createDatabase({ DATABASE_URL: runtimeUrl });
  await hotEventLoad({
    owner,
    runtime,
    account,
    api,
    service,
    stop,
    env: baseEnv,
    privateRoot,
    root,
  });
  record(
    "Hot event concurrency, correctness invariants, expiry race, Redis burst and outbox crash/retry/restart passed",
  );

  const { saveArtist } = await import("../backend/src/services/admin.ts");
  const artist = await runtime.artist.findFirstOrThrow();
  await saveArtist(
    runtime,
    artist.id,
    {
      name: artist.name,
      slug: artist.slug,
      bio: artist.bio,
      image: artist.image,
      genre: artist.genre,
      imageAlt: artist.imageAlt,
    },
    {
      actorId: a.id,
      ip: "local-lab-pseudonym",
      userAgent: "local-lab-pseudonym",
    },
  );
  const heldSeat = await runtime.eventSeat.findFirstOrThrow({
    where: { eventId: "echoes-new-york", status: "AVAILABLE" },
  });
  await hold(a, [heldSeat.id]);
  const invariants = async (db) => {
    const rows =
      await db.$queryRaw`SELECT (SELECT count(*) FROM "EventSeat" s LEFT JOIN "OrderItem" i ON i."eventSeatId"=s.id LEFT JOIN "Order" o ON o.id=i."orderId" WHERE s.status='SOLD' AND (i.id IS NULL OR o.status<>'CONFIRMED'))::int AS sold_orphans,(SELECT count(*) FROM "Order" WHERE total<>subtotal-discount+fees+tax)::int AS unbalanced_orders,(SELECT count(*) FROM "Ticket" t JOIN "OrderItem" i ON i.id=t."orderItemId" JOIN "Order" o ON o.id=i."orderId" WHERE o.status<>'CONFIRMED')::int AS invalid_tickets,(SELECT count(*) FROM "SeatHold" h JOIN "EventSeat" s ON s.id=h."eventSeatId" WHERE s.status<>'HELD')::int AS invalid_holds`;
    assert.deepEqual(rows[0], {
      sold_orphans: 0,
      unbalanced_orders: 0,
      invalid_tickets: 0,
      invalid_holds: 0,
    });
    return rows[0];
  };
  await invariants(owner);
  await inspectIntegrity((sql) => owner.$queryRawUnsafe(sql));
  await run("database-integrity", ["scripts/ops/integrity.mjs"], {
    ...baseEnv,
    INTEGRITY_DATABASE_URL: ownerUrl,
  });
  const counts = async (db) =>
    Object.fromEntries(
      await Promise.all(
        ["user", "event", "seatHold", "order", "ticket", "auditLog"].map(
          async (model) => [model, await db[model].count()],
        ),
      ),
    );
  const expected = await counts(owner);
  assert.ok(Object.values(expected).every((n) => n > 0));
  const snapshot =
    await owner.$queryRaw`SELECT o.id,o.total,o.status,i."eventSeatId",t.id AS ticket,t.status AS ticket_status,o."userId" FROM "Order" o LEFT JOIN "OrderItem" i ON i."orderId"=o.id LEFT JOIN "Ticket" t ON t."orderItemId"=i.id ORDER BY o.id,i.id`;
  const constraints =
    await owner.$queryRaw`SELECT conname,contype::text,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname`;
  const auditRows = await owner.auditLog.findMany({ orderBy: { id: "asc" } });
  const holdRows = await owner.seatHold.findMany({ orderBy: { id: "asc" } });
  const restoredName = "vibetix_preproduction_restore_test";
  await owner.$executeRaw`CREATE DATABASE vibetix_preproduction_restore_test`;
  Object.assign(process.env, {
    BACKUP_DATABASE_URL: ownerUrl,
    RESTORE_DATABASE_URL: dbUrl("vibetix", credentials.owner, restoredName),
    BACKUP_KEY_FILE: join(privateRoot, "backup-key"),
    PGSSLROOTCERT: ca,
    LD_LIBRARY_PATH: ld,
    PG_DUMP_BIN: baseEnv.PG_DUMP_BIN,
    PG_RESTORE_BIN: baseEnv.PG_RESTORE_BIN,
    DATABASE_EXPECTED_NAME: restoredName,
    ALLOW_DATABASE_RESTORE: "true",
  });
  await writeFile(
    process.env.BACKUP_KEY_FILE,
    randomBytes(32).toString("hex"),
    { mode: 0o600 },
  );
  const archive = join(privateRoot, "populated.vbt");
  await backup(archive);
  const goodKey = await readFile(process.env.BACKUP_KEY_FILE);
  await writeFile(process.env.BACKUP_KEY_FILE, randomBytes(32).toString("hex"));
  await assert.rejects(restore(archive));
  await writeFile(process.env.BACKUP_KEY_FILE, goodKey);
  const corrupt = await readFile(archive);
  corrupt[40] ^= 1;
  await writeFile(join(privateRoot, "tampered.vbt"), corrupt, { mode: 0o600 });
  await assert.rejects(restore(join(privateRoot, "tampered.vbt")));
  await restore(archive);
  await assert.rejects(restore(archive), /empty/);
  const restoredOwner = new PrismaClient({
    datasources: {
      db: { url: dbUrl("vibetix", credentials.owner, restoredName) },
    },
  });
  try {
    assert.deepEqual(await counts(restoredOwner), expected);
    await invariants(restoredOwner);
    await inspectIntegrity((sql) => restoredOwner.$queryRawUnsafe(sql));
    assert.deepEqual(
      await restoredOwner.$queryRaw`SELECT conname,contype::text,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname`,
      constraints,
    );
    assert.deepEqual(
      await restoredOwner.auditLog.findMany({ orderBy: { id: "asc" } }),
      auditRows,
    );
    assert.deepEqual(
      await restoredOwner.seatHold.findMany({ orderBy: { id: "asc" } }),
      holdRows,
    );
    assert.deepEqual(
      await restoredOwner.$queryRaw`SELECT o.id,o.total,o.status,i."eventSeatId",t.id AS ticket,t.status AS ticket_status,o."userId" FROM "Order" o LEFT JOIN "OrderItem" i ON i."orderId"=o.id LEFT JOIN "Ticket" t ON t."orderItemId"=i.id ORDER BY o.id,i.id`,
      snapshot,
    );
  } finally {
    await restoredOwner.$disconnect();
  }
  await run("restored-grants", ["scripts/ops/database-security.mjs"], {
    ...provisioning,
    DATABASE_ADMIN_URL: dbUrl("vibetix", credentials.owner, restoredName),
    DATABASE_EXPECTED_NAME: restoredName,
    DATABASE_URL: dbUrl("vibetix_app", credentials.runtime, restoredName),
    MIGRATION_DATABASE_URL: dbUrl(
      "vibetix_migrator",
      credentials.migrator,
      restoredName,
    ),
  });
  const restoredRuntime = createDatabase({
    DATABASE_URL: dbUrl("vibetix_app", credentials.runtime, restoredName),
  });
  const { buildApp } = await import("../backend/src/app.ts"),
    { loadConfig } = await import("../backend/src/config.ts");
  const savedEnv = { ...process.env };
  Object.assign(process.env, baseEnv);
  const restoredApp = await buildApp(restoredRuntime, loadConfig(), false);
  try {
    assert.equal(
      (await restoredApp.inject({ url: "/api/v1/catalog" })).statusCode,
      200,
    );
    assert.equal(
      (
        await restoredApp.inject({
          url: "/api/v1/orders",
          headers: { cookie: winner.cookie },
        })
      ).statusCode,
      200,
    );
    await assert.rejects(restoredRuntime.auditLog.deleteMany({}));
  } finally {
    await restoredApp.close();
    await restoredRuntime.$disconnect();
    for (const k of Object.keys(process.env))
      if (!(k in savedEnv)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
  record(
    "Populated encrypted recovery: wrong key/tamper denied; counts, totals, ownership, constraints, holds and audit integrity preserved; restored API reads succeed",
  );
  await stop(simApi);
  simApi = null;
  await stop(mainApi);
  mainApi = null;

  simApi = service("api-database-outage", process.execPath, [
    "backend/dist/backend/src/server.js",
  ]);
  await until(async () => (await http("/ready")).status === 200);
  worker = service("worker", process.execPath, [
    "backend/dist/backend/src/worker.js",
  ]);
  await runtime.$disconnect();
  await owner.$disconnect();
  await postgres.stop();
  pgRunning = false;
  assert.equal((await http("/live")).status, 200);
  assert.equal((await http("/ready")).status, 503);
  assert.ok((await api("/orders", { cookie: a.cookie })).status >= 500);
  await until(async () =>
    (await readFile(join(privateRoot, "worker.log"), "utf8")).includes(
      '"worker_iteration_failed"',
    ),
  );
  await stop(worker);
  worker = null;
  await stop(simApi);
  simApi = null;
  record(
    "PostgreSQL process outage leaves liveness available and denies readiness/private API access",
  );
  await postgres.start();
  pgRunning = true;
  runtime = createDatabase({ DATABASE_URL: runtimeUrl });
  owner = new PrismaClient({ datasources: { db: { url: ownerUrl } } });

  await run(
    "fullstack-browser",
    ["--import", "tsx", "scripts/fullstack-qa.ts"],
    {
      ...baseEnv,
      QA_CHROMIUM_EXECUTABLE:
        process.env.QA_CHROMIUM_EXECUTABLE ||
        "/tmp/vibetix-browser/chrome-linux64/chrome",
      QA_MEASURE_PERFORMANCE: "true",
    },
  );
  record(
    "Existing complete browser journey and startup samples run with runtime DB role, authenticated TLS Redis and no fixture fallback",
  );

  const logs = (
    await Promise.all(
      [
        "api-production",
        "api-simulation",
        "api-database-outage",
        "load-api",
        "load-worker",
        "budget-one",
        "budget-two",
        "worker",
      ].map((n) => readFile(join(privateRoot, n + ".log"), "utf8")),
    )
  ).join("\n");
  for (const secret of [
    ...Object.values(credentials),
    baseEnv.TICKET_SIGNING_KEY,
    baseEnv.ABUSE_KEY_SECRET,
    ...privateValues,
    (await readFile(join(privateRoot, "backup-key"), "utf8")).trim(),
  ])
    assert.ok(!logs.includes(secret));
  const events = logs.split("\n").flatMap((line) => {
    try {
      const row = JSON.parse(line);
      return row.event ? [row.event] : [];
    } catch {
      return [];
    }
  });
  assert.ok(events.includes("abuse_store_unavailable"));
  assert.ok(events.includes("authorization_failed"));
  assert.ok(events.includes("booking_rejected"));
  assert.ok(events.includes("worker_iteration_failed"));
  for (const name of [
    "api_request",
    "checkout_started",
    "checkout_confirmed",
    "idempotent_replay",
    "hold_updated",
    "hold_conflict",
    "worker_heartbeat",
  ])
    assert.ok(events.includes(name), `Missing operational event ${name}`);
  await writeFile(
    join(root, "results.json"),
    JSON.stringify(
      {
        passed: true,
        checks,
        timings,
        counts: expected,
        invariants: {
          sold_orphans: 0,
          unbalanced_orders: 0,
          invalid_tickets: 0,
          invalid_holds: 0,
        },
        events: [...new Set(events)],
        versions,
        proxyHeaders,
        durationMs: Date.now() - started,
        scope:
          "Isolated native local TLS/PG/Redis/nginx only; not container or public infrastructure validation.",
      },
      null,
      2,
    ),
  );
  console.info(
    "Native preproduction execution passed. Docker/public infrastructure gates remain open.",
  );
} finally {
  for (const child of [...children]) {
    try {
      await stop(child);
    } catch {
      child.kill("SIGKILL");
    }
  }
  redisAdmin?.disconnect();
  await runtime?.$disconnect();
  await owner?.$disconnect();
  if (pgRunning) await postgres.stop();
  await rm(join(privateRoot, "pgdata"), { recursive: true, force: true });
}
