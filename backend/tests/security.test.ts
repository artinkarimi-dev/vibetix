import { verifyDemoResetTarget } from "../src/security/demo.js";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  mkdtemp,
  writeFile,
  readFile,
  symlink,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { loadConfig, securityDefaults } from "../src/config.js";
import { createOrder } from "../src/services/booking.js";
import {
  SimulationPayments,
  PortfolioDemoPayments,
} from "../src/services/payments.js";
import { LocalEmailTransport } from "../src/services/email.js";
if (!process.env.DATABASE_URL || process.env.ALLOW_DATABASE_TESTS !== "true")
  throw new Error(
    "Security tests require an isolated database and explicit test authorization.",
  );
const db = new PrismaClient();
const cfg: Config = {
  ...securityDefaults,
  NODE_ENV: "test",
  DATABASE_URL: process.env.DATABASE_URL,
  TICKET_SIGNING_KEY: randomBytes(48).toString("hex"),
  APP_ORIGIN: "http://localhost:5173",
  HOST: "127.0.0.1",
  PORT: 3001,
  HOLD_SECONDS: 600,
  ALLOW_SIMULATED_PAYMENTS: "true",
  EMAIL_TRANSPORT: "disabled",
};
const app = await buildApp(db, cfg, false);
const password = "Security-" + randomBytes(20).toString("hex");
const call = (
  method: "GET" | "POST" | "DELETE",
  path: string,
  cookie = "",
  payload?: Record<string, unknown>,
  key?: string,
) =>
  app.inject({
    method,
    url: "/api/v1" + path,
    headers: {
      origin: cfg.APP_ORIGIN,
      ...(cookie ? { cookie } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    ...(payload ? { payload } : {}),
  });
async function account() {
  const email = `audit-${randomUUID()}@example.test`;
  const r = await call("POST", "/auth/register", "", {
    email,
    password,
    firstName: "Audit",
    lastName: "Account",
  });
  assert.equal(r.statusCode, 201, r.body);
  const login = await call("POST", "/auth/login", "", { email, password });
  assert.equal(login.statusCode, 200, login.body);
  return {
    id: login.json().user.id as string,
    email,
    cookie: String(login.headers["set-cookie"]).split(";")[0],
  };
}
after(async () => {
  await app.close();
  await db.$disconnect();
});
test("authenticated CSRF, IDOR, SQL injection, mass assignment and error-disclosure probes are blocked", async () => {
  const a = await account(),
    b = await account();
  for (const origin of [undefined, "null", "https://attacker.invalid"]) {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/favorites",
      headers: { cookie: a.cookie, ...(origin ? { origin } : {}) },
      payload: { eventId: "echoes-new-york" },
    });
    assert.equal(r.statusCode, 403);
  }
  const cors = await app.inject({
    url: "/api/v1/auth/me",
    headers: { origin: "https://attacker.invalid", cookie: a.cookie },
  });
  assert.notEqual(
    cors.headers["access-control-allow-origin"],
    "https://attacker.invalid",
  );
  assert.equal(cors.headers["cache-control"], "no-store");
  assert.equal(
    (
      await call("POST", "/favorites", a.cookie, {
        eventId: "echoes-new-york",
        userId: b.id,
      })
    ).statusCode,
    400,
  );
  assert.equal((await call("GET", "/admin/orders", a.cookie)).statusCode, 403);
  const tokenForgery = a.cookie.replace(
    /=.*/,
    "=" + randomBytes(32).toString("base64url"),
  );
  assert.equal((await call("GET", "/tickets", tokenForgery)).statusCode, 401);
  const before = await db.seatHold.count();
  const sql = encodeURIComponent("' OR 1=1;--");
  const injection = await call("POST", `/events/${sql}/hold-seats`, a.cookie, {
    seatIds: [],
  });
  assert.equal(injection.statusCode, 404, injection.body);
  assert.equal(await db.seatHold.count(), before);
  const malformed = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin: cfg.APP_ORIGIN, "content-type": "application/json" },
    payload: '{"email":',
  });
  assert.equal(malformed.statusCode, 400);
  assert.ok(!/stack|node_modules|SELECT|passwordHash/.test(malformed.body));
  const oversized = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin: cfg.APP_ORIGIN },
    payload: { email: "x".repeat(33000), password },
  });
  assert.equal(oversized.statusCode, 413);
  assert.ok(!/passwordHash|DATABASE_URL|prisma|\.ts:\d/.test(oversized.body));
  const unicode = await call("POST", "/auth/register", "", {
    email: `unicode-${randomUUID()}@example.test`,
    password: "界".repeat(30),
    firstName: "A",
    lastName: "B",
  });
  assert.equal(unicode.statusCode, 400);
  const switched = await call("POST", "/auth/login", a.cookie, {
    email: b.email,
    password,
  });
  assert.equal(switched.statusCode, 200);
  assert.equal(
    (await call("GET", "/tickets", a.cookie)).statusCode,
    401,
    "Previous browser cookie must be revoked on account switch",
  );
});
test("public inventory summary does not disclose draft/cancelled event inventory", async () => {
  const published = await db.event.findUniqueOrThrow({
    where: { id: "echoes-new-york" },
  });
  const draft = await db.event.create({
    data: {
      id: `audit-draft-${randomUUID()}`,
      artistId: published.artistId,
      venueId: published.venueId,
      title: "Private audit event",
      description: "Not public",
      date: published.date,
      doorsOpen: published.doorsOpen,
      presentation: {},
      status: "DRAFT",
    },
  });
  try {
    assert.equal(
      (await call("GET", `/events/${draft.id}/availability`)).statusCode,
      404,
    );
    assert.equal(
      (await call("GET", `/events/${draft.id}/seats`)).statusCode,
      404,
    );
  } finally {
    await db.event.delete({ where: { id: draft.id } });
  }
});
test("revoked/used tickets are not re-signed from stale order snapshots, including idempotent replay", async () => {
  const a = await account();
  const seats = await db.eventSeat.findMany({
    where: {
      eventId: "echoes-new-york",
      status: "AVAILABLE",
      seat: { section: { label: "102" } },
    },
    take: 2,
    orderBy: { id: "asc" },
  });
  assert.equal(seats.length, 2);
  const ids = seats.map((s) => s.id);
  assert.equal(
    (
      await call("POST", "/events/echoes-new-york/hold-seats", a.cookie, {
        seatIds: ids,
      })
    ).statusCode,
    200,
  );
  const key = randomUUID(),
    body = {
      eventId: "echoes-new-york",
      seatIds: ids,
      extras: {},
      promo: "",
      attendee: {
        fullName: "Audit Account",
        email: a.email,
        phone: "+1 212 555 0100",
      },
      deliveryMethod: "mobile",
      paymentOutcome: "success",
    };
  const result = await call("POST", "/orders", a.cookie, body, key);
  assert.equal(result.statusCode, 201, result.body);
  const order = result.json().order;
  await db.ticket.update({
    where: { id: order.tickets[0].id },
    data: { status: "REVOKED" },
  });
  await db.ticket.update({
    where: { id: order.tickets[1].id },
    data: { status: "USED" },
  });
  assert.equal(
    (await call("GET", "/tickets", a.cookie)).json().tickets.length,
    0,
  );
  assert.equal(
    (await call("GET", `/orders/${order.id}`, a.cookie)).json().order.tickets
      .length,
    0,
  );
  assert.equal(
    (await call("POST", "/orders", a.cookie, body, key)).json().order.tickets
      .length,
    0,
  );
  const stranger = await account();
  assert.equal(
    (await call("GET", `/orders/${order.id}`, stranger.cookie)).statusCode,
    404,
  );
});
test("inventory scope, seat limits and forged negative money are rejected without writes", async () => {
  const a = await account();
  const foreignSeat = await db.eventSeat.findFirstOrThrow({
    where: { eventId: { not: "echoes-new-york" } },
  });
  const holdsBefore = await db.seatHold.count({ where: { userId: a.id } });
  for (const seatIds of [
    [foreignSeat.id],
    [foreignSeat.id, foreignSeat.id],
    Array.from({ length: 7 }, (_, i) => `forged-${i}`),
  ]) {
    const r = await call(
      "POST",
      "/events/echoes-new-york/hold-seats",
      a.cookie,
      { seatIds },
    );
    assert.equal(r.statusCode, 400, r.body);
  }
  const body = {
    eventId: "echoes-new-york",
    seatIds: [foreignSeat.id],
    extras: {},
    promo: "",
    attendee: {
      fullName: "Audit Account",
      email: a.email,
      phone: "+1 212 555 0100",
    },
    deliveryMethod: "mobile",
    paymentOutcome: "success",
  };
  for (const forged of [
    { total: -1 },
    { subtotal: -100 },
    { ticketPrice: -1 },
    { userId: "another-user" },
    { status: "CONFIRMED" },
  ]) {
    const r = await call(
      "POST",
      "/orders",
      a.cookie,
      { ...body, ...forged },
      randomUUID(),
    );
    assert.equal(r.statusCode, 400, r.body);
  }
  const negativeExtra = await call("POST", "/quotes", a.cookie, {
    eventId: body.eventId,
    seatIds: body.seatIds,
    extras: { lounge: -1 },
    promo: "",
  });
  assert.equal(negativeExtra.statusCode, 400, negativeExtra.body);
  assert.equal(
    await db.seatHold.count({ where: { userId: a.id } }),
    holdsBefore,
  );
  assert.equal(await db.order.count({ where: { userId: a.id } }), 0);
});
test("cancelled and unpublished events cannot reissue ticket QR values on reads or checkout replay", async () => {
  const a = await account();
  const source = await db.event.findUniqueOrThrow({
    where: { id: "echoes-new-york" },
  });
  const seat = await db.eventSeat.findFirstOrThrow({
    where: { eventId: source.id },
  });
  const event = await db.event.create({
    data: {
      id: `audit-lifecycle-${randomUUID()}`,
      artistId: source.artistId,
      venueId: source.venueId,
      title: "Lifecycle audit",
      description: "Disposable event",
      date: source.date,
      doorsOpen: source.doorsOpen,
      presentation: source.presentation ?? {},
      status: "ON_SALE",
    },
  });
  const inventory = await db.eventSeat.create({
    data: {
      id: `audit-seat-${randomUUID()}`,
      eventId: event.id,
      seatId: seat.seatId,
      price: seat.price,
    },
  });
  const body = {
    eventId: event.id,
    seatIds: [inventory.id],
    extras: {},
    promo: "",
    attendee: {
      fullName: "Audit Account",
      email: a.email,
      phone: "+1 212 555 0100",
    },
    deliveryMethod: "mobile",
    paymentOutcome: "success",
  };
  const key = randomUUID();
  try {
    const held = await call(
      "POST",
      `/events/${event.id}/hold-seats`,
      a.cookie,
      { seatIds: body.seatIds },
    );
    assert.equal(held.statusCode, 200, held.body);
    const created = await call("POST", "/orders", a.cookie, body, key);
    assert.equal(created.statusCode, 201, created.body);
    const order = created.json().order;
    assert.equal(order.tickets.length, 1);
    assert.ok(order.tickets[0].qrValue);
    const check = async (expected: number) => {
      const detail = await call("GET", `/orders/${order.id}`, a.cookie);
      assert.equal(detail.statusCode, 200, detail.body);
      assert.equal(
        detail.json().order.tickets.length,
        expected,
        "order detail projection",
      );
      const orders = await call("GET", "/orders", a.cookie);
      assert.equal(
        orders.json().orders.find((o: { id: string }) => o.id === order.id)
          .tickets.length,
        expected,
        "order list projection",
      );
      const tickets = await call("GET", "/tickets", a.cookie);
      assert.equal(
        tickets.json().tickets.length,
        expected,
        "ticket list projection",
      );
      const replay = await call("POST", "/orders", a.cookie, body, key);
      assert.equal(replay.statusCode, 201, replay.body);
      assert.equal(replay.json().order.id, order.id);
      assert.equal(
        replay.json().order.tickets.length,
        expected,
        "idempotent replay projection",
      );
    };
    await check(1);
    for (const status of ["CANCELLED", "DRAFT"] as const) {
      await db.event.update({ where: { id: event.id }, data: { status } });
      await check(0);
      for (const [path, payload] of [
        [`/events/${event.id}/hold-seats`, { seatIds: body.seatIds }],
        [
          "/quotes",
          { eventId: event.id, seatIds: body.seatIds, extras: {}, promo: "" },
        ],
        ["/orders", body],
      ] as const) {
        const denied = await call(
          "POST",
          path,
          a.cookie,
          payload,
          randomUUID(),
        );
        assert.equal(denied.statusCode, 409, denied.body);
        assert.equal(denied.json().error.code, "NOT_ON_SALE");
      }
    }
    await db.event.update({
      where: { id: event.id },
      data: { status: "ON_SALE" },
    });
    await check(1);
    await db.event.update({
      where: { id: event.id },
      data: {
        date: new Date(Date.now() - 1000),
        doorsOpen: new Date(Date.now() - 3600000),
      },
    });
    await check(0);
    const expired = await call("GET", `/orders/${order.id}`, a.cookie);
    assert.match(expired.json().order.ticketNotice, /expired/);
    await db.event.update({
      where: { id: event.id },
      data: { date: source.date, doorsOpen: source.doorsOpen },
    });
    const page = await call("GET", "/orders?limit=1", a.cookie);
    assert.equal(page.json().orders.length, 1);
    assert.equal(
      (
        await call(
          "GET",
          `/orders?cursor=${order.id}`,
          (await account()).cookie,
        )
      ).statusCode,
      404,
    );
    assert.equal(await db.order.count({ where: { eventId: event.id } }), 1);
    assert.equal(
      await db.ticket.count({ where: { orderItem: { orderId: order.id } } }),
      1,
    );
  } finally {
    await db.event.update({
      where: { id: event.id },
      data: { status: "DRAFT" },
    });
  }
});
test("simulation cannot mark seats sold in production even with an accidentally enabled flag", async () => {
  const production = {
    ...cfg,
    NODE_ENV: "production" as const,
    APP_ORIGIN: "https://vibetix.invalid",
  };
  assert.throws(() =>
    new SimulationPayments(production).authorize(randomUUID(), 100, "success"),
  );
  await assert.rejects(
    createOrder(
      db,
      production,
      randomUUID(),
      {
        eventId: "echoes-new-york",
        seatIds: ["irrelevant"],
        extras: {},
        promo: "",
        attendee: {
          fullName: "Audit Account",
          email: "audit@example.test",
          phone: "+1 212 555 0100",
        },
        deliveryMethod: "mobile",
        paymentOutcome: "success",
      },
      randomUUID(),
    ),
    /not been configured/,
  );
  const previous = { ...process.env };
  try {
    Object.assign(process.env, production);
    assert.throws(() => loadConfig());
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
test("IP rate limits reject spoofed forwarded addresses and keep peer budgets separate", async () => {
  const limited = await buildApp(db, cfg, false);
  try {
    for (let i = 0; i < 11; i++) {
      const r = await limited.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        remoteAddress: "198.51.100.11",
        headers: {
          origin: cfg.APP_ORIGIN,
          "x-forwarded-for": `203.0.113.${i + 1}`,
        },
        payload: { email: "unknown@example.test", password },
      });
      assert.equal(r.statusCode, i < 10 ? 401 : 429);
    }
    const other = await limited.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      remoteAddress: "198.51.100.12",
      headers: { origin: cfg.APP_ORIGIN },
      payload: { email: "unknown@example.test", password },
    });
    assert.equal(other.statusCode, 401);
  } finally {
    await limited.close();
  }
});
test("local email capture rejects traversal and symlinks and creates private files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vibetix-security-email-"));
  try {
    const transport = new LocalEmailTransport(dir),
      id = randomUUID(),
      message = {
        idempotencyKey: randomUUID(),
        orderId: id,
        to: "audit@example.test",
        subject: "Audit",
      };
    await assert.rejects(
      transport.deliver({ ...message, orderId: "../outside" }),
    );
    const sentinel = join(dir, "sentinel");
    await writeFile(sentinel, "unchanged");
    await symlink(sentinel, join(dir, `${id}.json`));
    await assert.rejects(transport.deliver(message));
    assert.equal(await readFile(sentinel, "utf8"), "unchanged");
    await rm(join(dir, `${id}.json`));
    assert.equal(await transport.deliver(message), "LOCAL_CAPTURED");
    assert.equal((await stat(join(dir, `${id}.json`))).mode & 0o777, 0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("portfolio authorization is explicit and cannot enable the commercial simulation adapter", () => {
  assert.throws(() =>
    new PortfolioDemoPayments({ APP_MODE: "commercial" }).authorize(
      randomUUID(),
      100,
      "success",
    ),
  );
  const decision = new PortfolioDemoPayments({
    APP_MODE: "portfolio",
  }).authorize(randomUUID(), 100, "success");
  assert.equal(decision.provider, "portfolio-demo");
  assert.equal(decision.status, "SUCCEEDED");
  assert.throws(() =>
    new SimulationPayments({
      ...cfg,
      NODE_ENV: "production",
      APP_MODE: "portfolio",
    }).authorize(randomUUID(), 100, "success"),
  );
});

test("demo reset cannot target normal production or skip maintenance confirmation", () => {
  const env = {
    APP_MODE: "portfolio",
    DEMO_RESET_CONFIRM: "DELETE_PORTFOLIO_DATA",
    DEMO_RESET_OFFLINE: "true",
    DEMO_DATABASE_ADMIN_URL:
      "postgresql://operator:unused@localhost/vibetix_demo_test",
    DATABASE_EXPECTED_NAME: "vibetix_demo_test",
  };
  assert.equal(verifyDemoResetTarget(env), "vibetix_demo_test");
  for (const patch of [
    { APP_MODE: "commercial" },
    { DEMO_RESET_CONFIRM: "" },
    { DEMO_RESET_OFFLINE: "false" },
    { DATABASE_EXPECTED_NAME: "another_demo" },
    {
      DEMO_DATABASE_ADMIN_URL:
        "postgresql://operator:unused@localhost/vibetix_production",
    },
  ])
    assert.throws(() => verifyDemoResetTarget({ ...env, ...patch }));
});
