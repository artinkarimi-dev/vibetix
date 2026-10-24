import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import { issueHttpRace, checkHoldResults } from './core.mjs';

const BASE = process.env.STAGE2_TARGET ?? 'http://backend:3001';
const ORIGIN = process.env.APP_ORIGIN ?? 'http://127.0.0.1:8080';
const COUNT = Number(process.env.STAGE2_REQUESTS ?? '1000');
const CONCURRENCY = Number(process.env.STAGE2_CONCURRENCY ?? '24');
const seatsToSell = 10;
const db = new PrismaClient();
const telemetryEnabled = process.env.STAGE3_TELEMETRY === '1';
const telemetry = (event) => {
  if (telemetryEnabled) console.log(`STAGE3_EVENT_JSON=${JSON.stringify(event)}`);
};

const runId = randomUUID();
const eventId = `stage2-${runId}`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const assertLocal = () => {
  assert.equal(process.env.NODE_ENV, 'development', 'Stage 2 is forbidden in production');
  assert.equal(process.env.ALLOW_SIMULATED_PAYMENTS, 'true', 'Simulated payment required');
  assert.equal(new URL(process.env.DATABASE_URL).hostname, 'postgres', 'Expected isolated compose database');
  assert.equal(new URL(BASE).hostname, 'backend', 'Only the internal Docker backend is an allowed target');
  assert.equal(COUNT, 1000, 'Stage 2 must make exactly 1000 competing HTTP hold attempts');
  assert.ok(Number.isInteger(CONCURRENCY) && CONCURRENCY >= 1 && CONCURRENCY <= COUNT);
};
const request = async (path, { cookie, body, key, method = 'POST' } = {}) => {
  const response = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      ...(cookie ? { Cookie: `vibetix-session=${cookie}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(25000),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
};
let completed = false;
async function main() {
  assertLocal();
  telemetry({ type: 'phase', phase: 'preparing', runId, message: 'در حال آماده‌سازی دیتابیس جدا و ۱۰۰۰ نشست آزمایشی...' });
  const ready = await fetch(`${BASE}/ready`, { signal: AbortSignal.timeout(5000) });
  assert.equal(ready.status, 200, 'API must be ready before load starts');
  const source = await db.event.findFirst({ where: { status: 'ON_SALE' }, orderBy: { id: 'asc' } });
  assert.ok(source, 'Run migrations and seed before load testing');
  const physicalSeats = await db.seat.findMany({
    where: { section: { venueId: source.venueId } }, orderBy: { id: 'asc' }, take: seatsToSell,
  });
  assert.equal(physicalSeats.length, seatsToSell, 'Ten physical seats are required');
  await db.event.create({
    data: {
      id: eventId,
      artistId: source.artistId,
      venueId: source.venueId,
      title: 'STAGE 2 ISOLATED CONCURRENCY TEST — NOT A REAL SHOW',
      description: 'Ephemeral load testing fixture',
      date: new Date(Date.now() + 30 * 24 * 3600_000),
      doorsOpen: new Date(Date.now() + 30 * 24 * 3600_000 - 3600_000),
      status: 'ON_SALE',
      presentation: source.presentation,
    },
  });
  const seats = physicalSeats.map((seat, i) => ({
    id: `stage2-${runId}-seat-${i}`,
    seatId: seat.id,
    eventId,
    price: 2500,
  }));
  await db.eventSeat.createMany({ data: seats });
  const users = Array.from({ length: COUNT }, (_, i) => ({
    id: randomUUID(),
    email: `s2-${runId}-${i}@example.test`,
    firstName: 'Concurrency',
    lastName: 'Participant',
    passwordHash: '!NO_PASSWORD_LOGIN_FOR_LOAD_TEST!',
    role: 'CUSTOMER',
    token: randomBytes(32).toString('base64url'),
  }));
  await db.user.createMany({ data: users.map(({ token, ...u }) => u) });
  await db.session.createMany({ data: users.map((u) => ({
    id: hash(u.token),
    userId: u.id,
    expiresAt: new Date(Date.now() + 3600_000),
  })) });
  console.log(`STAGE2 fixture: isolated event ${eventId}, ${users.length} users, ${seats.length} seats`);
  telemetry({ type: 'phase', phase: 'racing', runId, concurrency: CONCURRENCY, message: 'رقابت واقعی HTTP شروع شد؛ نتایج مستقیماً از Fastify دریافت می‌شوند.' });
  const started = performance.now();
  let won = 0, lost = 0, errors = 0;
  let lastSent = 0;
  const batch = [];
  const partialTimes = [];
  const flush = (done) => {
    if (!batch.length) return;
    const elapsedMs = Math.max(1, performance.now() - started);
    const times = [...partialTimes].sort((a, b) => a - b);
    telemetry({
      type: 'progress', entries: batch.splice(0), completed: done,
      won, lost, errors, elapsedMs: Number(elapsedMs.toFixed(1)),
      rps: Number((done * 1000 / elapsedMs).toFixed(2)),
      p50: times[Math.ceil(times.length * .5) - 1] ?? null,
      p95: times[Math.ceil(times.length * .95) - 1] ?? null,
      p99: times[Math.ceil(times.length * .99) - 1] ?? null,
    });
    lastSent = performance.now();
  };
  const { results, metrics } = await issueHttpRace({
    users, seats, baseUrl: BASE, origin: ORIGIN, concurrency: CONCURRENCY,
    onProgress: (done, result) => {
      if (!telemetryEnabled) return;
      const outcome = result.status === 200 && result.code === null ? 'won'
        : result.status === 409 && result.code === 'SEAT_UNAVAILABLE' ? 'lost' : 'error';
      if (outcome === 'won') won++; else if (outcome === 'lost') lost++; else errors++;
      partialTimes.push(result.ms);
      batch.push({ index: result.userIndex, outcome });
      if (batch.length >= 20 || performance.now() - lastSent > 150 || done === COUNT) flush(done);
    },
  });
  if (telemetryEnabled) flush(COUNT);
  const evaluation = checkHoldResults(results, seatsToSell);
  const heldSeats = await db.eventSeat.count({ where: { eventId, status: 'HELD' } });
  const availableSeats = await db.eventSeat.count({ where: { eventId, status: 'AVAILABLE' } });
  const heldRows = await db.seatHold.count({ where: { eventSeat: { eventId } } });
  console.log(`STAGE2 hold wave: ${evaluation.successful} won, ${evaluation.rejected} rejected, ${evaluation.unexpected} unexpected | DB HELD=${heldSeats}, AVAILABLE=${availableSeats}, holdRows=${heldRows}`);
  assert.ok(evaluation.passed, `Unexpected HTTP results: ${JSON.stringify({ ...evaluation, byStatus: metrics.byStatus, byCode: metrics.byCode }).slice(0, 1600)}`);
  assert.deepEqual({ heldSeats, availableSeats, heldRows }, { heldSeats: 10, availableSeats: 0, heldRows: 10 });
  const winners = evaluation.successfulIndices;
  telemetry({ type: 'phase', phase: 'checkout', message: 'رزروها بررسی شدند؛ در حال ایجاد سفارش و بلیت در PostgreSQL...' });
  const purchased = await Promise.all(winners.map(async (index) => {
    const buyer = users[index];
    const seat = seats[index % seatsToSell];
    const key = randomUUID();
    const body = {
      eventId,
      seatIds: [seat.id],
      extras: {},
      promo: '',
      attendee: { fullName: 'Stage Two Verification', email: buyer.email, phone: '+1 212 555 0100' },
      deliveryMethod: 'mobile',
      paymentOutcome: 'success',
    };
    const first = await request('/orders', { cookie: buyer.token, key, body });
    assert.equal(first.status, 201, `Checkout failed for winner ${index}: ${JSON.stringify(first.data).slice(0, 200)}`);
    const second = await request('/orders', { cookie: buyer.token, key, body });
    assert.equal(second.status, 201, 'Idempotent retry must return 201');
    assert.equal(second.data.order?.id, first.data.order?.id, 'Retry created a duplicate order');
    return { id: first.data.order?.id, seatId: seat.id, userIndex: index };
  }));
  assert.equal(new Set(purchased.map((o) => o.id)).size, seatsToSell, 'Orders must be unique');
  telemetry({ type: 'phase', phase: 'verifying', message: 'تطبیق تعداد سفارش‌ها، پرداخت‌ها و بلیت‌ها با PostgreSQL...' });
  const soldSeats = await db.eventSeat.count({ where: { eventId, status: 'SOLD' } });
  const finalHolds = await db.seatHold.count({ where: { eventSeat: { eventId } } });
  const orderCount = await db.order.count({ where: { eventId, status: 'CONFIRMED' } });
  const itemCount = await db.orderItem.count({ where: { order: { eventId } } });
  const ticketCount = await db.ticket.count({ where: { orderItem: { order: { eventId } } } });
  const paymentCount = await db.payment.count({ where: { order: { eventId } } });
  const dbCounts = { soldSeats, finalHolds, orderCount, itemCount, ticketCount, paymentCount };
  console.log('STAGE2 database invariants:', JSON.stringify(dbCounts));
  assert.deepEqual(dbCounts, { soldSeats: 10, finalHolds: 0, orderCount: 10, itemCount: 10, ticketCount: 10, paymentCount: 10 });
  const afterSale = await request(`/events/${eventId}/hold-seats`, { cookie: users[evaluation.successfulIndices.includes(0) ? 1 : 0].token, body: { seatIds: [seats[0].id] } });
  assert.equal(afterSale.status, 409, 'No participant should buy a sold seat');
  const report = {
    version: 2,
    scenario: 'Actual HTTP / PostgreSQL stage 2 competition: 1000 independent authenticated participants, 10 seats',
    runId,
    timestamp: new Date().toISOString(),
    passed: true,
    transport: '1000 real HTTP POST requests to Fastify; bounded in-flight concurrency',
    isolation: 'Unique disposable Docker Compose project/database and Redis, no access to Stage 1 database',
    payment: 'simulated, no real money',
    elapsedTotalMs: Number((performance.now() - started).toFixed(2)),
    holds: { wins: evaluation.successful, conflicts: evaluation.rejected, unexpected: evaluation.unexpected },
    metrics,
    database: dbCounts,
    orders: purchased,
  };
  completed = true;
  console.log(`STAGE2_REPORT_JSON=${JSON.stringify(report)}`);
  console.log('PASS Stage 2: 1000 real HTTP holds, 10 winners, 990 conflicts, 10 unique simulated checkouts and 10 persisted tickets.');
}
main().catch((error) => {
  console.error(`FAIL Stage 2: ${error?.stack ?? error}`);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
  if (!completed) console.error('Stage 2 failed: inspect stage2 logs. The harness never claims success after a partial checkout.');
});
