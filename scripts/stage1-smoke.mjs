import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.STAGE1_TEST_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const base = process.env.STAGE1_TEST_ROOT ? process.env.STAGE1_TEST_BASE : "http://127.0.0.1:8080";
const checks = [];
const note = (message) => { checks.push(message); console.log(`PASS ${message}`); };
const uri = (path) => `${base}${path}`;
const request = async (path, { method = "GET", body, cookie, key } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers.Origin = base;
  if (cookie) headers.Cookie = cookie;
  if (key) headers["Idempotency-Key"] = key;
  const response = await fetch(uri(path), {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const type = response.headers.get("content-type") ?? "";
  const data = type.includes("application/json") ? await response.json() : await response.text();
  return { status: response.status, data, headers: response.headers };
};
const ok = (response, status, operation) => {
  assert.equal(response.status, status, `${operation}: HTTP ${response.status}, ${JSON.stringify(response.data).slice(0, 400)}`);
  return response.data;
};
const createUser = async (kind) => {
  const email = `stage1-${kind}-${randomUUID()}@example.test`;
  const password = `S1-${randomBytes(22).toString("base64url")}`;
  const input = { firstName: "Stage", lastName: "Verification", email, password };
  ok(await request("/api/v1/auth/register", { method: "POST", body: input }), 201, "registration");
  const response = await request("/api/v1/auth/login", { method: "POST", body: { email, password } });
  ok(response, 200, "login");
  const token = response.headers.get("set-cookie")?.split(";")[0];
  assert.match(token ?? "", /^vibetix-session=[A-Za-z0-9_\-=]+$/, "HttpOnly session cookie was not issued");
  assert.match(response.headers.get("set-cookie") ?? "", /httponly/i);
  return { email, password, cookie: token };
};
const databaseRowCounts = (id) => {
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i);
  const sql = `SELECT (SELECT COUNT(*) FROM "Order" WHERE id='${id}' AND status='CONFIRMED'), (SELECT COUNT(*) FROM "OrderItem" WHERE "orderId"='${id}'), (SELECT COUNT(*) FROM "Ticket" WHERE "orderItemId" IN (SELECT id FROM "OrderItem" WHERE "orderId"='${id}'));`;
  const result = spawnSync("docker", [
    "compose", "--env-file", ".env.local", "exec", "-T", "postgres", "sh", "-c",
    'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -X -v ON_ERROR_STOP=1 -U vibetix -d vibetix -t -A -F "|" -c "$1"',
    "stage1", sql,
  ], { cwd: root, encoding: "utf8", timeout: 15000 });
  if (result.error || result.status !== 0) throw new Error(`PostgreSQL verification failed: ${(result.stderr ?? result.error?.message ?? "").trim().slice(0, 300)}`);
  return result.stdout.trim();
};
const main = async () => {
  const env = await readFile(".env.local", "utf8");
  if (!/^ALLOW_SIMULATED_PAYMENTS=true\s*$/m.test(env) || !/^APP_ORIGIN=http:\/\/127\.0\.0\.1:8080\s*$/m.test(env))
    throw new Error("Only the isolated local, simulated-payment stack can run this data-creating smoke test.");
  assert.equal((await request("/healthz")).status, 200, "frontend edge health");
  note("frontend edge is serving HTTP");
  const catalog = ok(await request("/api/v1/catalog"), 200, "database-backed catalog");
  assert.ok(Array.isArray(catalog.events) && catalog.events.length > 0, "Seeded catalog is empty");
  note("reverse proxy, API and PostgreSQL seeded catalog");
  let chosen;
  for (const event of catalog.events.filter((value) => Date.parse(value.startsAt) > Date.now())) {
    const seats = ok(await request(`/api/v1/events/${encodeURIComponent(event.id)}/seats?limit=200`), 200, "inventory");
    const seat = seats.seats.find((value) => value.status === "available");
    if (seat) { chosen = { eventId: event.id, seatId: seat.id }; break; }
  }
  assert.ok(chosen, "No future event with an available seat. Use an isolated seeded local stack.");
  const buyer = await createUser("buyer");
  const competitor = await createUser("competitor");
  note("two real accounts and HttpOnly sessions in PostgreSQL");
  const seatIds = [chosen.seatId];
  ok(await request(`/api/v1/events/${encodeURIComponent(chosen.eventId)}/hold-seats`, { method: "POST", cookie: buyer.cookie, body: { seatIds } }), 200, "buyer hold");
  const conflict = await request(`/api/v1/events/${encodeURIComponent(chosen.eventId)}/hold-seats`, { method: "POST", cookie: competitor.cookie, body: { seatIds } });
  assert.equal(conflict.status, 409, `Expected 409 for a competing hold, got ${conflict.status}`);
  assert.equal(conflict.data?.error?.code, "SEAT_UNAVAILABLE");
  note("another account cannot hold the same reserved seat");
  const quoteInput = { eventId: chosen.eventId, seatIds, extras: {}, promo: "" };
  const quote = ok(await request("/api/v1/quotes", { method: "POST", cookie: buyer.cookie, body: quoteInput }), 200, "server quote");
  assert.ok(quote.totals && Number.isFinite(quote.totals.grandTotal), "Server pricing is absent");
  note("server-side price quote");
  const purchase = { ...quoteInput, attendee: { fullName: "Stage Verification", email: buyer.email, phone: "+1 212 555 0100" }, deliveryMethod: "mobile", paymentOutcome: "success" };
  const key = randomUUID();
  const result = ok(await request("/api/v1/orders", { method: "POST", cookie: buyer.cookie, key, body: purchase }), 201, "checkout");
  const orderId = result.order?.id;
  assert.match(orderId ?? "", /^[0-9a-f-]{36}$/i);
  assert.equal(result.order.tickets?.length, 1);
  note("simulated checkout created one real order and ticket");
  const replay = ok(await request("/api/v1/orders", { method: "POST", cookie: buyer.cookie, key, body: purchase }), 201, "idempotent replay");
  assert.equal(replay.order.id, orderId);
  note("duplicate checkout key does not create a second order");
  const freshLogin = await request("/api/v1/auth/login", { method: "POST", body: { email: buyer.email, password: buyer.password } });
  ok(freshLogin, 200, "new session login");
  const freshCookie = freshLogin.headers.get("set-cookie")?.split(";")[0];
  const persisted = ok(await request(`/api/v1/orders/${orderId}`, { cookie: freshCookie }), 200, "order reread");
  assert.equal(persisted.order?.id, orderId);
  assert.equal(persisted.order?.tickets?.length, 1);
  note("order is retrieved from API with a newly authenticated session");
  const seatsAfter = ok(await request(`/api/v1/events/${encodeURIComponent(chosen.eventId)}/seats?limit=200`), 200, "sold seat inventory");
  assert.equal(seatsAfter.seats.find((value) => value.id === chosen.seatId)?.status, "unavailable");
  const cannotBuy = await request(`/api/v1/events/${encodeURIComponent(chosen.eventId)}/hold-seats`, { method: "POST", cookie: competitor.cookie, body: { seatIds } });
  assert.equal(cannotBuy.status, 409);
  note("sold seat cannot be reserved by a competing account");
  assert.equal(databaseRowCounts(orderId), "1|1|1", "A confirmed order, one item and one ticket must exist in PostgreSQL");
  note("direct PostgreSQL query verified 1 order, 1 item and 1 ticket");
  const report = { scenario: "Stage 1 isolated local database smoke test", passed: true, timestamp: new Date().toISOString(), orderId, checks, caution: "Test creates two accounts and purchases one fictional seat. Simulated payment only." };
  await mkdir("artifacts/stage1", { recursive: true });
  await writeFile("artifacts/stage1/smoke.json", JSON.stringify(report, null, 2));
  console.log(`\nPASS ${checks.length} checks. Report: artifacts/stage1/smoke.json`);
};
main().catch((error) => {
  console.error(`\nFAIL Stage 1 smoke: ${error.message}`);
  console.error("Inspect npm run stage1:status and npm run stage1:logs. The test never deletes accounts, orders or volumes.");
  process.exitCode = 1;
});
