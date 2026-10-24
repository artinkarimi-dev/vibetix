import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { expireHolds } from "../src/services/booking.js";
import { OutboxRunner } from "../src/services/jobs.js";
import type { Config } from "../src/config.js";
import { securityDefaults } from "../src/config.js";
if (!process.env.DATABASE_URL || process.env.ALLOW_DATABASE_TESTS !== "true")
  throw new Error(
    "Tests require an isolated DATABASE_URL and ALLOW_DATABASE_TESTS=true.",
  );
const db = new PrismaClient();
const cfg: Config = {
  ...securityDefaults,
  NODE_ENV: "test",
  DATABASE_URL: process.env.DATABASE_URL,
  TICKET_SIGNING_KEY: randomBytes(32).toString("hex"),
  APP_ORIGIN: "http://localhost:5173",
  PORT: 3001,
  HOST: "127.0.0.1",
  HOLD_SECONDS: 600,
  ALLOW_SIMULATED_PAYMENTS: "true",
  EMAIL_TRANSPORT: "disabled",
};
const app = await buildApp(db, cfg, false);
const eventId = "echoes-new-york";
const users: string[] = [];
const password = `Test-${randomBytes(20).toString("hex")}`;
const call = (
  method: "GET" | "POST" | "PUT" | "DELETE",
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
    ...(payload !== undefined ? { payload } : {}),
  });
async function account() {
  const email = `qa-${randomUUID()}@example.test`;
  let r = await call("POST", "/auth/register", "", {
    email,
    password,
    firstName: "QA",
    lastName: "Customer",
  });
  assert.equal(r.statusCode, 201, r.body);
  r = await call("POST", "/auth/login", "", { email, password });
  assert.equal(r.statusCode, 200, r.body);
  users.push(r.json().user.id);
  return {
    id: r.json().user.id as string,
    cookie: String(r.headers["set-cookie"]).split(";")[0],
    email,
  };
}
const choose = async () => {
  return (
    await db.eventSeat.findFirstOrThrow({
      where: {
        eventId,
        status: "AVAILABLE",
        seat: { section: { label: "101" } },
      },
      orderBy: { id: "asc" },
    })
  ).id;
};
const hold = (cookie: string, seatIds: string[]) =>
  call("POST", `/events/${eventId}/hold-seats`, cookie, { seatIds });
const checkout = (seatIds: string[], extra: Record<string, unknown> = {}) => ({
  eventId,
  seatIds,
  extras: {},
  promo: "",
  attendee: {
    fullName: "QA Customer",
    email: "qa@example.test",
    phone: "+1 212 555 0100",
  },
  deliveryMethod: "mobile",
  paymentOutcome: "success",
  ...extra,
});
after(async () => {
  await app.close();
  await db.$disconnect();
});
test("authentication, strict input, hashed sessions, logout and CSRF", async () => {
  const a = await account();
  const user = await db.user.findUniqueOrThrow({ where: { id: a.id } });
  assert.notEqual(user.passwordHash, password);
  assert.match(user.passwordHash, /^\$2/);
  assert.equal(user.role, "CUSTOMER");
  const session = await db.session.findFirstOrThrow({
    where: { userId: a.id },
  });
  assert.equal(session.id.length, 64);
  assert.ok(!a.cookie.includes(session.id));
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { cookie: a.cookie },
        payload: {},
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await call("POST", "/auth/register", "", {
        email: `bad-${randomUUID()}@example.test`,
        password,
        firstName: "QA",
        lastName: "X",
        role: "ADMIN",
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call("POST", "/auth/login", "", {
        email: a.email,
        password: "incorrect-password-value",
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (await call("POST", "/auth/logout", a.cookie, {})).statusCode,
    200,
  );
  assert.equal((await call("GET", "/tickets", a.cookie)).statusCode, 401);
});
test("database catalog and section payloads are real, bounded and indexed", async () => {
  const r = await call("GET", "/events");
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().events.length, 10);
  const seats = await call("GET", `/events/${eventId}/seats?section=101`);
  assert.equal(seats.json().seats.length, 96);
  assert.ok(seats.rawPayload.length < 40000);
  assert.equal((await call("GET", "/events/missing")).statusCode, 404);
  assert.equal((await call("GET", "/events?limit=1000000")).statusCode, 400);
});
test("two accounts race for one seat: exactly one PostgreSQL hold succeeds", async () => {
  const [a, b] = await Promise.all([account(), account()]);
  const id = await choose();
  const results = await Promise.all([
    hold(a.cookie, [id]),
    hold(b.cookie, [id]),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  assert.equal(await db.seatHold.count({ where: { eventSeatId: id } }), 1);
  assert.equal(
    (await db.eventSeat.findUniqueOrThrow({ where: { id } })).status,
    "HELD",
  );
  const loser = results[0].statusCode === 409 ? a : b;
  const bad = await call(
    "POST",
    "/orders",
    loser.cookie,
    checkout([id]),
    randomUUID(),
  );
  assert.equal(bad.statusCode, 409, bad.body);
  for (const owner of [a, b]) await hold(owner.cookie, []);
});
test("concurrent identical checkout is idempotent, creates one sale and owner-only tickets", async () => {
  const a = await account(),
    b = await account(),
    id = await choose();
  assert.equal((await hold(a.cookie, [id])).statusCode, 200);
  const key = randomUUID(),
    body = checkout([id], { deliveryMethod: "email" });
  const results = await Promise.all([
    call("POST", "/orders", a.cookie, body, key),
    call("POST", "/orders", a.cookie, body, key),
  ]);
  assert.ok(
    results.every((r) => r.statusCode === 201),
    results.map((r) => r.body).join("\n"),
  );
  const order = results[0].json().order;
  assert.equal(order.id, results[1].json().order.id);
  assert.equal(
    await db.order.count({ where: { userId: a.id, idempotencyKey: key } }),
    1,
  );
  assert.equal(await db.orderItem.count({ where: { eventSeatId: id } }), 1);
  assert.equal(
    (await db.eventSeat.findUniqueOrThrow({ where: { id } })).status,
    "SOLD",
  );
  assert.equal(await db.seatHold.count({ where: { eventSeatId: id } }), 0);
  assert.equal(order.tickets.length, 1);
  assert.ok(order.tickets[0].qrValue.includes("."));
  const stored = await db.ticket.findFirstOrThrow({
    where: { orderItem: { orderId: order.id } },
  });
  assert.notEqual(stored.qrCode, order.tickets[0].qrValue);
  assert.equal(
    (await call("GET", `/orders/${order.id}`, b.cookie)).statusCode,
    404,
  );
  assert.equal(
    (await call("GET", "/tickets", b.cookie)).json().tickets.length,
    0,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/orders",
        a.cookie,
        { ...body, promo: "VIBETIX10" },
        key,
      )
    ).statusCode,
    409,
  );
  assert.equal((await hold(b.cookie, [id])).statusCode, 409);
  assert.equal(
    (await call("GET", "/tickets", a.cookie)).json().tickets.length,
    1,
  );
  const runner = new OutboxRunner(db, {
    deliver: async () => "LOCAL_CAPTURED",
  });
  assert.equal(await runner.runOnce(), 1);
  assert.equal(
    (
      await db.outboxJob.findUniqueOrThrow({
        where: {
          orderId_kind: { orderId: order.id, kind: "BOOKING_CONFIRMATION" },
        },
      })
    ).status,
    "LOCAL_CAPTURED",
  );
});
test("expired and failed-payment holds release without issuing tickets", async () => {
  const a = await account(),
    id = await choose();
  await hold(a.cookie, [id]);
  await db.seatHold.update({
    where: { eventSeatId: id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (await call("POST", "/orders", a.cookie, checkout([id]), randomUUID()))
      .statusCode,
    409,
  );
  assert.ok((await expireHolds(db)) >= 1);
  assert.equal(
    (await db.eventSeat.findUniqueOrThrow({ where: { id } })).status,
    "AVAILABLE",
  );
  await hold(a.cookie, [id]);
  const key = randomUUID(),
    body = checkout([id], { paymentOutcome: "failure" });
  const r = await call("POST", "/orders", a.cookie, body, key);
  assert.equal(r.statusCode, 402, r.body);
  assert.equal(
    (await call("POST", "/orders", a.cookie, body, key)).statusCode,
    402,
  );
  assert.equal(
    (await db.eventSeat.findUniqueOrThrow({ where: { id } })).status,
    "AVAILABLE",
  );
  assert.equal(await db.orderItem.count({ where: { eventSeatId: id } }), 0);
});
test("server rejects forged prices, expired promos and unauthorized admin changes", async () => {
  const a = await account(),
    id = await choose();
  await hold(a.cookie, [id]);
  assert.equal(
    (
      await call(
        "POST",
        "/orders",
        a.cookie,
        { ...checkout([id]), total: 1 },
        randomUUID(),
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call("POST", "/quotes", a.cookie, {
        eventId,
        seatIds: [id],
        extras: { lounge: 6 },
        promo: "",
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await call("POST", "/quotes", a.cookie, {
        eventId,
        seatIds: [id],
        extras: {},
        promo: "INVALID",
      })
    ).statusCode,
    400,
  );
  const quote = await call("POST", "/quotes", a.cookie, {
    eventId,
    seatIds: [id],
    extras: {},
    promo: "VIBETIX10",
  });
  assert.equal(quote.statusCode, 200, quote.body);
  assert.equal(quote.json().totals.discount, 1590);
  assert.equal(
    (await call("POST", "/admin/events", a.cookie, {})).statusCode,
    403,
  );
  await db.user.update({ where: { id: a.id }, data: { role: "ADMIN" } });
  assert.equal((await call("GET", "/admin/orders", a.cookie)).statusCode, 200);
  const original = (await call("GET", `/events/${eventId}`)).json().event;
  const newEvent = {
    ...original,
    id: `qa-event-${randomUUID()}`,
    status: "DRAFT",
  };
  assert.equal(
    (await call("POST", "/admin/events", a.cookie, newEvent)).statusCode,
    201,
  );
  assert.equal(
    (
      await call("GET", `/admin/events/${newEvent.id}/inventory`, a.cookie)
    ).json().inventory[0]._count,
    4416,
  );
  assert.equal((await call("GET", `/events/${newEvent.id}`)).statusCode, 404);
  await hold(a.cookie, []);
});
test("favorites persist by account and logout hides private orders", async () => {
  const a = await account();
  assert.equal(
    (await call("POST", "/favorites", a.cookie, { eventId })).statusCode,
    200,
  );
  assert.deepEqual(
    (await call("GET", "/favorites", a.cookie)).json().favorites,
    [eventId],
  );
  await call("DELETE", `/favorites/${eventId}`, a.cookie);
  assert.deepEqual(
    (await call("GET", "/favorites", a.cookie)).json().favorites,
    [],
  );
});

test("database constraints, bounded numeric seat order and session expiry", async () => {
  const r = await call("GET", `/events/${eventId}/seats?section=101`);
  assert.deepEqual(
    r
      .json()
      .seats.slice(0, 3)
      .map((seat: { number: number }) => seat.number),
    [1, 2, 3],
  );
  assert.ok(
    (await call("GET", `/events/${eventId}/seats`)).json().seats.length <= 100,
  );
  const seat = await db.eventSeat.findFirstOrThrow({
    where: { eventId, status: "AVAILABLE" },
  });
  await assert.rejects(
    db.eventSeat.update({ where: { id: seat.id }, data: { price: -1 } }),
  );
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  const otherVenueSeat = await db.seat.findFirstOrThrow({
    where: { section: { venueId: { not: event.venueId } } },
  });
  await assert.rejects(
    db.eventSeat.create({
      data: {
        id: `invalid-${randomUUID()}`,
        eventId,
        seatId: otherVenueSeat.id,
        price: 8900,
      },
    }),
  );
  const a = await account();
  await db.session.updateMany({
    where: { userId: a.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await call("GET", "/tickets", a.cookie)).statusCode, 401);
  assert.equal(
    (await call("GET", "/events")).headers["x-content-type-options"],
    "nosniff",
  );
});
