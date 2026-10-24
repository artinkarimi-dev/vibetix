import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { connect } from "./ops/database.mjs";
import { buildApp } from "../backend/src/app.ts";
import { securityDefaults } from "../backend/src/config.ts";
if (
  process.env.ALLOW_DATABASE_TESTS !== "true" ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error("Isolated test parent required.");
const name = `portfolio_reset_${randomUUID().replaceAll("-", "")}_demo_test`;
const admin = await connect("DATABASE_URL");
let db, app;
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${name}`;
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  MIGRATION_DATABASE_URL: url.toString(),
  APP_MODE: "portfolio",
  NODE_ENV: "test",
  DEMO_DATABASE_ADMIN_URL: url.toString(),
  DATABASE_EXPECTED_NAME: name,
  DEMO_RESET_CONFIRM: "DELETE_PORTFOLIO_DATA",
  DEMO_RESET_OFFLINE: "true",
};
delete env.ADMIN_EMAIL;
delete env.ADMIN_PASSWORD;
const run = (args, expected = 0) => {
  const result = spawnSync(process.execPath, args, { env, encoding: "utf8" });
  assert.equal(
    result.status,
    expected,
    `Isolated reset stage failed: ${args[0]}`,
  );
};
try {
  await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(name)}`);
  run(["scripts/ops/migrate.mjs"]);
  run(["--import", "tsx", "backend/prisma/seed.ts"]);
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const cfg = {
    ...securityDefaults,
    NODE_ENV: "test",
    APP_MODE: "portfolio",
    DATABASE_URL: url.toString(),
    TICKET_SIGNING_KEY: randomBytes(48).toString("hex"),
    APP_ORIGIN: "http://localhost:5173",
    HOST: "127.0.0.1",
    PORT: 3001,
    HOLD_SECONDS: 600,
    ALLOW_SIMULATED_PAYMENTS: "false",
    EMAIL_TRANSPORT: "disabled",
  };
  app = await buildApp(db, cfg, false);
  const headers = { origin: cfg.APP_ORIGIN },
    email = `reset-${randomUUID()}@example.test`,
    password = randomBytes(24).toString("hex");
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        headers,
        payload: { email, password, firstName: "Demo", lastName: "Reset" },
      })
    ).statusCode,
    201,
  );
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers,
    payload: { email, password },
  });
  headers.cookie = String(login.headers["set-cookie"]).split(";")[0];
  const seat = await db.eventSeat.findFirstOrThrow({
    where: { eventId: "echoes-new-york", status: "AVAILABLE" },
  });
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/events/echoes-new-york/hold-seats",
        headers,
        payload: { seatIds: [seat.id] },
      })
    ).statusCode,
    200,
  );
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/orders",
    headers: { ...headers, "idempotency-key": randomUUID() },
    payload: {
      eventId: "echoes-new-york",
      seatIds: [seat.id],
      extras: {},
      promo: "",
      attendee: { fullName: "Demo Reset", email, phone: "5550100" },
      deliveryMethod: "mobile",
      paymentOutcome: "success",
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  const order = response.json().order;
  await app.close();
  app = null;
  await db.payment.update({
    where: { orderId: order.id },
    data: { provider: "non-demo-provider" },
  });
  run(["--import", "tsx", "scripts/demo-reset.mjs"], 1);
  assert.equal(await db.order.count(), 1);
  await db.payment.update({
    where: { orderId: order.id },
    data: { provider: "portfolio-demo" },
  });
  run(["--import", "tsx", "scripts/demo-reset.mjs", "--dry-run"]);
  assert.equal(await db.order.count(), 1);
  run(["--import", "tsx", "scripts/demo-reset.mjs"]);
  assert.equal(await db.order.count(), 0);
  assert.equal(await db.user.count(), 0);
  assert.equal(await db.event.count(), 0);
  const migrations =
    await db.$queryRaw`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
  assert.equal(migrations[0].n, 3);
  run(["--import", "tsx", "backend/prisma/seed.ts"]);
  assert.equal(await db.event.count(), 10);
  assert.ok((await db.event.findFirstOrThrow()).date.getTime() > Date.now());
  console.info(
    "PASS offline portfolio reset: non-demo provider refused, dry-run preserved data, demo order/account removed, 3 migrations preserved and 10 future fictional events reseeded.",
  );
} finally {
  await app?.close();
  await db?.$disconnect();
  await admin.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(name)}`);
  await admin.end();
}
