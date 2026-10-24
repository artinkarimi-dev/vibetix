import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { buildApp } from "../src/app.js";
import { securityDefaults, loadConfig, type Config } from "../src/config.js";
import { authenticate, sessionHash } from "../src/services/auth.js";
import { saveArtist } from "../src/services/admin.js";
import {
  completeAdminStepUp,
  requireAdminAssurance,
} from "../src/security/admin.js";
import { verifyRuntimeDatabase } from "../src/security/database.js";
import { securityEvent } from "../src/security/events.js";
import { createDatabase } from "../src/database/client.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
if (
  process.env.ALLOW_DATABASE_TESTS !== "true" ||
  !process.env.RUNTIME_DATABASE_URL ||
  !process.env.REDIS_TEST_URL
)
  throw new Error(
    "Run scripts/verify-production.mjs against isolated PostgreSQL and Redis.",
  );

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});
const runtime = new PrismaClient({
  datasources: { db: { url: process.env.RUNTIME_DATABASE_URL } },
});
const cfg: Config = {
  ...securityDefaults,
  NODE_ENV: "test",
  DATABASE_URL: process.env.RUNTIME_DATABASE_URL,
  TICKET_SIGNING_KEY: randomBytes(48).toString("hex"),
  ABUSE_KEY_SECRET: randomBytes(32).toString("hex"),
  APP_ORIGIN: "http://localhost:5173",
  HOST: "127.0.0.1",
  PORT: 3001,
  HOLD_SECONDS: 600,
  ALLOW_SIMULATED_PAYMENTS: "true",
  EMAIL_TRANSPORT: "disabled",
};
const app = await buildApp(runtime, cfg, false);
test("liveness survives unavailable dependencies while readiness returns a private 503", async () => {
  const unavailable = await buildApp(
    {
      $queryRaw: async () => {
        throw new Error("private-database-detail");
      },
    } as never,
    cfg,
    false,
  );
  try {
    assert.equal((await unavailable.inject({ url: "/live" })).statusCode, 200);
    for (const url of ["/ready", "/health"]) {
      const result = await unavailable.inject({ url });
      assert.equal(result.statusCode, 503);
      assert.equal(result.json().error.code, "NOT_READY");
      assert.ok(!result.body.includes("private-database-detail"));
    }
  } finally {
    await unavailable.close();
  }
});
test("database connection pools and wait timeouts reject unsafe unbounded overrides", () => {
  for (const [name, value] of [
    ["connection_limit", "0"],
    ["connection_limit", "100000"],
    ["connect_timeout", "0"],
    ["pool_timeout", "0"],
  ]) {
    const url = new URL(cfg.DATABASE_URL);
    url.searchParams.set(name, value);
    assert.throws(
      () => createDatabase({ DATABASE_URL: url.toString() }),
      /pool\/timeout/,
    );
  }
});
test("file-backed database secrets configure the actual Prisma connection and reject ambiguous sources", async () => {
  const before = { ...process.env },
    dir = await mkdtemp(join(tmpdir(), "vibetix-secret-test-"));
  try {
    const file = join(dir, "database-url");
    await writeFile(file, process.env.RUNTIME_DATABASE_URL!, { mode: 0o600 });
    delete process.env.DATABASE_URL;
    process.env.DATABASE_URL_FILE = file;
    const parsed = loadConfig(),
      client = createDatabase(parsed);
    try {
      const [row] = await client.$queryRaw<
        { name: string }[]
      >`SELECT current_user AS name`;
      assert.equal(row.name, "vibetix_app");
    } finally {
      await client.$disconnect();
    }
    process.env.DATABASE_URL = process.env.RUNTIME_DATABASE_URL;
    assert.throws(() => loadConfig(), /Ambiguous configuration field/);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
    await rm(dir, { recursive: true, force: true });
  }
});
test("migration role can own DDL while remaining non-superuser", async () => {
  const migrator = new PrismaClient({
    datasources: { db: { url: process.env.MIGRATION_DATABASE_URL! } },
  });
  try {
    const [role] = await migrator.$queryRaw<
      { rolsuper: boolean; rolcreaterole: boolean }[]
    >`SELECT rolsuper,rolcreaterole FROM pg_roles WHERE rolname=current_user`;
    assert.deepEqual(role, { rolsuper: false, rolcreaterole: false });
    await assert.rejects(
      migrator.$transaction(async (tx) => {
        await tx.$executeRaw`CREATE TABLE public.security_migration_probe(id int)`;
        await tx.$executeRaw`CREATE SCHEMA security_migration_probe`;
        await tx.$executeRaw`CREATE FUNCTION public.security_function_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1'`;
        const [privilege] = await tx.$queryRaw<
          { allowed: boolean }[]
        >`SELECT has_function_privilege('vibetix_app','public.security_function_probe()','EXECUTE') AS allowed`;
        assert.equal(privilege.allowed, false);
        throw new Error("rollback probe");
      }),
      /rollback probe/,
    );
    await migrator.$queryRaw`SELECT id FROM "_prisma_migrations" LIMIT 1`;
  } finally {
    await migrator.$disconnect();
  }
});
const password = "Production-" + randomBytes(24).toString("hex");
const call = (path: string, cookie = "", payload?: Record<string, unknown>) =>
  app.inject({
    url: "/api/v1" + path,
    method: payload ? "POST" : "GET",
    headers: { origin: cfg.APP_ORIGIN, ...(cookie ? { cookie } : {}) },
    ...(payload ? { payload } : {}),
  });
async function account() {
  const email = `production-${randomUUID()}@example.test`;
  assert.equal(
    (
      await call("/auth/register", "", {
        email,
        password,
        firstName: "Test",
        lastName: "Account",
      })
    ).statusCode,
    201,
  );
  const login = await call("/auth/login", "", { email, password });
  assert.equal(login.statusCode, 200, login.body);
  return {
    email,
    id: login.json().user.id as string,
    cookie: String(login.headers["set-cookie"]).split(";")[0],
  };
}
after(async () => {
  await app.close();
  await runtime.$disconnect();
  await db.$disconnect();
});
test("registration responses do not disclose duplicate accounts, and failed credentials remain generic", async () => {
  const email = `registration-${randomUUID()}@example.test`,
    body = { email, password, firstName: "Test", lastName: "Account" };
  const fresh = await call("/auth/register", "", body),
    duplicate = await call("/auth/register", "", body);
  assert.equal(fresh.statusCode, 201);
  assert.equal(duplicate.statusCode, 201);
  assert.deepEqual(fresh.json(), { ok: true });
  assert.deepEqual(duplicate.json(), fresh.json());
  const known = await call("/auth/login", "", {
    email,
    password: "incorrect-password",
  });
  const unknown = await call("/auth/login", "", {
    email: `unknown-${randomUUID()}@example.test`,
    password: "incorrect-password",
  });
  assert.equal(known.statusCode, unknown.statusCode);
  assert.deepEqual(known.json().error, unknown.json().error);
});
test("structured security events exclude credentials, raw IP, user-agent and body data", () => {
  let data: unknown;
  const req = {
    ip: "198.51.100.123",
    id: "request",
    user: { id: "actor" },
    routeOptions: { url: "/api/v1/auth/login" },
    headers: { cookie: "private-cookie", "user-agent": "private-agent" },
    body: { password: "private-password", email: "private@example.test" },
    log: {
      warn: (value: unknown) => {
        data = value;
      },
    },
  };
  securityEvent(req as never, cfg, "login_failed");
  const logged = JSON.stringify(data);
  for (const forbidden of [
    "private-cookie",
    "private-password",
    "private@example.test",
    "198.51.100.123",
    "private-agent",
  ])
    assert.ok(!logged.includes(forbidden));
  assert.ok(logged.includes("login_failed"));
});
test("runtime database can execute application CRUD but cannot migrate, elevate users or alter audit history", async () => {
  const a = await account();
  assert.equal((await call("/tickets", a.cookie)).statusCode, 200);
  const [flags] = await runtime.$queryRaw<
    { rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean }[]
  >`SELECT rolsuper,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user`;
  assert.deepEqual(flags, {
    rolsuper: false,
    rolcreaterole: false,
    rolcreatedb: false,
  });
  await assert.rejects(
    runtime.$executeRaw`CREATE TABLE public.security_forbidden(id int)`,
  );
  await assert.rejects(runtime.$executeRaw`CREATE SCHEMA security_forbidden`);
  await assert.rejects(runtime.$queryRaw`SELECT * FROM "_prisma_migrations"`);
  await assert.rejects(
    runtime.user.update({ where: { id: a.id }, data: { role: "ADMIN" } }),
  );
  await assert.rejects(
    runtime.user.create({
      data: {
        email: `forbidden-${randomUUID()}@example.test`,
        passwordHash: "not-a-real-hash",
        firstName: "No",
        lastName: "Admin",
        role: "ADMIN",
      },
    }),
  );
  await assert.rejects(runtime.auditLog.deleteMany({}));
  await assert.rejects(
    runtime.auditLog.updateMany({ data: { action: "TAMPERED" } }),
  );
  await assert.rejects(
    verifyRuntimeDatabase(db, { ...cfg, NODE_ENV: "production" }),
    /privilege\/TLS/,
  );
});
test("admin audit writes commit with mutations and an audit failure rolls the mutation back", async () => {
  const audit = {
    actorId: randomUUID(),
    ip: "hashed-peer",
    userAgent: "hashed-agent",
  };
  const artist = {
    name: "Audit Artist",
    slug: `audit-${randomUUID()}`,
    bio: "Test",
    image: "/images/echoes-hero.webp",
    genre: "Test",
    imageAlt: "Test",
  };
  const id = `audit-${randomUUID()}`;
  await saveArtist(runtime, id, artist, audit);
  const log = await db.auditLog.findFirstOrThrow({ where: { resourceId: id } });
  assert.equal(log.action, "ARTIST_CHANGED");
  assert.deepEqual(log.metadata, { version: 1 });
  assert.equal(log.ip, audit.ip);
  const failed = `audit-${randomUUID()}`;
  await assert.rejects(
    saveArtist(
      runtime,
      failed,
      { ...artist, slug: `failed-${randomUUID()}` },
      { ...audit, actorId: null as unknown as string },
    ),
  );
  assert.equal(await db.artist.count({ where: { id: failed } }), 0);
  await db.auditLog.deleteMany({ where: { resourceId: id } });
  await db.artist.delete({ where: { id } });
});
test("admin absolute/idle session policy and MFA provider boundary deny forged or stale assurance", async () => {
  const a = await account();
  await db.user.update({ where: { id: a.id }, data: { role: "ADMIN" } });
  const token = a.cookie.slice(a.cookie.indexOf("=") + 1),
    key = sessionHash(token);
  const production = { ...cfg, NODE_ENV: "production" as const };
  await assert.rejects(requireAdminAssurance(db, production, token), /MFA/);
  await assert.rejects(
    completeAdminStepUp(db, cfg, token, "forged", {
      verify: async () => false,
    }),
    /MFA/,
  );
  assert.equal(
    (await db.session.findUniqueOrThrow({ where: { id: key } })).mfaVerifiedAt,
    null,
  );
  await completeAdminStepUp(db, cfg, token, "test-only-proof", {
    verify: async () => true,
  });
  await requireAdminAssurance(db, production, token);
  await db.session.update({
    where: { id: key },
    data: { mfaVerifiedAt: new Date(Date.now() - 600000) },
  });
  await assert.rejects(requireAdminAssurance(db, production, token), /MFA/);
  await db.session.update({
    where: { id: key },
    data: { lastSeenAt: new Date(Date.now() - 60000) },
  });
  await assert.rejects(
    completeAdminStepUp(
      db,
      { ...cfg, ADMIN_IDLE_SECONDS: 30 },
      token,
      "proof",
      { verify: async () => true },
    ),
    /sign in/,
  );
  await db.session.update({
    where: { id: key },
    data: { lastSeenAt: new Date(Date.now() - 1000000) },
  });
  assert.equal(await authenticate(db, token, cfg), null);
  await db.session.update({
    where: { id: key },
    data: { lastSeenAt: new Date(), createdAt: new Date(Date.now() - 3700000) },
  });
  assert.equal(await authenticate(db, token, cfg), null);
  const denied = await call("/admin/orders", a.cookie);
  assert.equal(denied.statusCode, 401);
});
test("Redis identity/IP counters are atomic across API instances and fail closed on store loss", async () => {
  const shared = {
    ...cfg,
    RATE_LIMIT_BACKEND: "redis" as const,
    REDIS_URL: process.env.REDIS_TEST_URL!,
    AUTH_IDENTITY_LIMIT: 2,
  };
  const one = await buildApp(runtime, shared, false),
    two = await buildApp(runtime, shared, false);
  const redis = new Redis(
    process.env.REDIS_TEST_INSPECT_URL || shared.REDIS_URL,
  );
  try {
    const email = `unknown-${randomUUID()}@example.test`;
    const requests = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        (i % 2 ? one : two).inject({
          method: "POST",
          url: "/api/v1/auth/login",
          remoteAddress: `198.51.100.${i + 1}`,
          headers: { origin: cfg.APP_ORIGIN },
          payload: { email, password },
        }),
      ),
    );
    assert.equal(requests.filter((r) => r.statusCode === 401).length, 2);
    assert.equal(requests.filter((r) => r.statusCode === 429).length, 4);
    const limited = requests.find((r) => r.statusCode === 429)!;
    assert.equal(limited.json().error.code, "RATE_LIMITED");
    assert.ok(Number(limited.headers["retry-after"]) > 0);
    const keys = await redis.keys("vibetix:abuse:v1:*");
    assert.ok(
      keys.every((key) => !key.includes(email) && !key.includes("198.51")),
    );
    // Isolate an outage to these clients, without stopping the shared Redis service.
    const unhealthy = await buildApp(runtime, shared, false);
    await unhealthy.close();
    // A disconnected store rejects instead of silently switching to memory.
    const { AbuseProtection } = await import("../src/security/abuse.js");
    const protection = new AbuseProtection(shared);
    await protection.start();
    protection.close();
    const req = {
      ip: "127.0.0.1",
      id: "outage",
      user: null,
      routeOptions: { url: "/api/v1/orders" },
      log: { warn: () => {} },
    };
    await assert.rejects(
      protection.check(req as never, "checkout", "x", 1),
      /temporarily unavailable/,
    );
  } finally {
    redis.disconnect();
    await one.close();
    await two.close();
  }
});
test("account booking/checkout/promo budgets reject repeated requests before business mutations", async () => {
  const limited = await buildApp(
    runtime,
    { ...cfg, HOLD_RATE_LIMIT: 1, CHECKOUT_RATE_LIMIT: 1, PROMO_RATE_LIMIT: 1 },
    false,
  );
  try {
    const a = await account();
    for (const path of [
      "/events/echoes-new-york/hold-seats",
      "/orders",
      "/quotes",
    ]) {
      const request = () =>
        limited.inject({
          method: "POST",
          url: "/api/v1" + path,
          headers: { origin: cfg.APP_ORIGIN, cookie: a.cookie },
          payload: {},
        });
      assert.notEqual((await request()).statusCode, 429);
      const response = await request();
      assert.equal(response.statusCode, 429);
      assert.equal(response.json().error.code, "RATE_LIMITED");
    }
  } finally {
    await limited.close();
  }
});
test("production environment validation rejects missing/shared stores, unsafe proxy trust and secret leakage", () => {
  const before = { ...process.env };
  try {
    const valid = {
      ...cfg,
      NODE_ENV: "production",
      APP_ORIGIN: "https://vibetix.invalid",
      ALLOW_SIMULATED_PAYMENTS: "false",
      RATE_LIMIT_BACKEND: "redis",
      REDIS_URL: `rediss://limiter:${randomBytes(32).toString("hex")}@redis.invalid:6379`,
      DATABASE_URL: `postgresql://vibetix_app:${randomBytes(32).toString("hex")}@db.invalid/vibetix?sslmode=require&sslaccept=strict`,
    };
    Object.assign(process.env, valid);
    assert.equal(loadConfig().NODE_ENV, "production");
    const cases: [string, string | undefined][] = [
      ["TICKET_SIGNING_KEY", undefined],
      ["REDIS_URL", undefined],
      ["ABUSE_KEY_SECRET", undefined],
      ["RATE_LIMIT_BACKEND", "memory"],
      ["REDIS_URL", "redis://127.0.0.1:6379"],
      ["REDIS_URL", "rediss://redis.invalid:6379"],
      ["DATABASE_URL", "postgresql://secret-user:secret-value@invalid/db"],
      ["TRUSTED_PROXY_CIDRS", "true"],
      ["TRUSTED_PROXY_CIDRS", "0.0.0.0/0"],
      ["APP_ORIGIN", "http://vibetix.invalid"],
      ["ALLOW_SIMULATED_PAYMENTS", "true"],
      ["EMAIL_TRANSPORT", "local"],
      ["HOLD_RATE_LIMIT", "0"],
    ];
    for (const [field, value] of cases) {
      Object.assign(process.env, valid);
      if (value === undefined) delete process.env[field];
      else process.env[field] = value;
      assert.throws(
        () => loadConfig(),
        (error) =>
          error instanceof Error &&
          error.message.includes(
            field === "RATE_LIMIT_BACKEND" ? "REDIS_URL" : field,
          ) &&
          !error.message.includes("secret-value"),
      );
    }
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});
test("only explicitly trusted proxies can supply the client IP used by shared limits", async () => {
  const proxy = await buildApp(
    runtime,
    { ...cfg, TRUSTED_PROXY_CIDRS: "192.0.2.10", AUTH_IP_LIMIT: 1 },
    false,
  );
  try {
    const request = (peer: string, forwarded: string) =>
      proxy.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        remoteAddress: peer,
        headers: { origin: cfg.APP_ORIGIN, "x-forwarded-for": forwarded },
        payload: { email: `proxy-${randomUUID()}@example.test`, password },
      });
    assert.equal((await request("192.0.2.10", "198.51.100.1")).statusCode, 401);
    assert.equal((await request("192.0.2.10", "198.51.100.2")).statusCode, 401);
    assert.equal((await request("192.0.2.11", "198.51.100.3")).statusCode, 401);
    assert.equal((await request("192.0.2.11", "198.51.100.4")).statusCode, 429);
  } finally {
    await proxy.close();
  }
});
