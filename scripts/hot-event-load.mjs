import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { OutboxRunner } from "../backend/src/services/jobs.ts";
import { LocalEmailTransport } from "../backend/src/services/email.ts";
import { inspectIntegrity } from "./ops/integrity.mjs";
export async function hotEventLoad({
  owner,
  runtime,
  account,
  api,
  service,
  stop,
  env,
  privateRoot,
  root,
}) {
  const started = performance.now(),
    samples = [],
    phases = [];
  let active = 0,
    peak = 0;
  const req = async (path, options = {}) => {
    const t = performance.now();
    active++;
    peak = Math.max(peak, active);
    try {
      const r = await api(path, { ...options, port: 23201 });
      samples.push({
        operation: path.replace(/\/events\/[^/]+/, "/events/:id"),
        status: r.status,
        ms: performance.now() - t,
      });
      return r;
    } finally {
      active--;
    }
  };
  const loadUrl = new URL(env.DATABASE_URL);
  loadUrl.searchParams.set("connection_limit", "10");
  const server = service(
    "load-api",
    process.execPath,
    ["backend/dist/backend/src/server.js"],
    {
      ...env,
      DATABASE_URL: loadUrl.toString(),
      PORT: "23201",
      GLOBAL_RATE_LIMIT: "50000",
      HOLD_RATE_LIMIT: "500",
      CHECKOUT_RATE_LIMIT: "100",
      PROMO_RATE_LIMIT: "500",
    },
  );
  let worker, limited;
  let monitorBusy = false;
  const pressure = [];
  const timer = setInterval(async () => {
    if (monitorBusy) return;
    monitorBusy = true;
    try {
      const rows =
        await owner.$queryRaw`SELECT count(*)::int AS connections,count(*) FILTER (WHERE state='active')::int AS active,count(*) FILTER (WHERE wait_event_type='Lock')::int AS lock_waiters FROM pg_stat_activity WHERE datname=current_database() AND usename='vibetix_app'`;
      pressure.push(rows[0]);
    } finally {
      monitorBusy = false;
    }
  }, 50);
  try {
    for (let i = 0; i < 200; i++) {
      try {
        if ((await fetch("http://127.0.0.1:23201/ready")).ok) break;
      } catch {

      }
      await new Promise((r) => setTimeout(r, 50));
      if (i === 199) throw new Error("Load API startup timeout.");
    }
    const users = [];
    for (let i = 0; i < 24; i++) users.push(await account());
    const eventId = "echoes-new-york";
    const free = await runtime.eventSeat.findMany({
      where: { eventId, status: "AVAILABLE" },
      take: 100,
      orderBy: { id: "asc" },
    });
    assert.ok(free.length >= 80);
    const hold = (u, ids) =>
      req(`/events/${eventId}/hold-seats`, {
        method: "POST",
        cookie: u.cookie,
        body: { seatIds: ids },
      });
    const body = (u, ids, extra = {}) => ({
      eventId,
      seatIds: ids,
      extras: {},
      promo: "",
      attendee: {
        fullName: "Load Test",
        email: u.email,
        phone: "+1 212 555 0100",
      },
      deliveryMethod: "mobile",
      paymentOutcome: "success",
      ...extra,
    });
    const checkout = (u, ids, key = randomUUID(), extra = {}) =>
      req("/orders", {
        method: "POST",
        cookie: u.cookie,
        headers: { "idempotency-key": key },
        body: body(u, ids, extra),
      });
    const bookingStart = performance.now();
    const reads = await Promise.all(
      Array.from({ length: 120 }, () => req(`/events/${eventId}/availability`)),
    );
    assert.ok(reads.every((r) => r.status === 200));
    phases.push("120 concurrent availability reads");
    const same = await Promise.all(users.map((u) => hold(u, [free[0].id])));
    assert.equal(same.filter((r) => r.status === 200).length, 1);
    assert.equal(same.filter((r) => r.status === 409).length, 23);
    await hold(users[same.findIndex((r) => r.status === 200)], []);
    phases.push("24 simultaneous users / one seat: exactly one holder");
    const held = await Promise.all(
      users.map((u, i) => hold(u, [free[1 + i].id])),
    );
    assert.ok(held.every((r) => r.status === 200));
    const replaced = await Promise.all(
      users.map((u, i) => hold(u, [free[25 + i].id])),
    );
    assert.ok(replaced.every((r) => r.status === 200));
    assert.equal(
      await runtime.seatHold.count({
        where: { eventSeatId: { in: free.slice(1, 25).map((x) => x.id) } },
      }),
      0,
    );
    for (let i = 0; i < users.length; i++)
      assert.equal(
        (
          await runtime.seatHold.findUniqueOrThrow({
            where: { eventSeatId: free[25 + i].id },
          })
        ).userId,
        users[i].id,
      );
    phases.push(
      "24 distinct holds replaced concurrently; old seats released and ownership exact",
    );
    worker = service(
      "load-worker",
      process.execPath,
      ["backend/dist/backend/src/worker.js"],
      env,
    );
    const quotes = await Promise.all(
      users.map((u, i) =>
        req("/quotes", {
          method: "POST",
          cookie: u.cookie,
          body: { eventId, seatIds: [free[25 + i].id], extras: {}, promo: "" },
        }),
      ),
    );
    assert.ok(quotes.every((r) => r.status === 200));
    // Expiry is arranged using the isolated owner; requests still follow real API/Redis/runtime roles.
    await owner.seatHold.updateMany({
      where: { eventSeatId: { in: free.slice(45, 49).map((x) => x.id) } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expiryStart = Date.now();
    const sales = await Promise.all(
      users.map((u, i) => checkout(u, [free[25 + i].id])),
    );
    assert.ok(sales.slice(0, 20).every((r) => r.status === 201));
    assert.ok(sales.slice(20).every((r) => r.status === 409));
    const fresh = users[0],
      retrySeat = free[49].id;
    assert.equal((await hold(fresh, [retrySeat])).status, 200);
    const key = randomUUID();
    const retries = await Promise.all(
      Array.from({ length: 32 }, () => checkout(fresh, [retrySeat], key)),
    );
    assert.ok(retries.every((r) => r.status === 201));
    assert.equal(new Set(retries.map((r) => r.data.order.id)).size, 1);
    const conflict = await checkout(fresh, [retrySeat], key, {
      promo: "different",
    });
    assert.equal(conflict.status, 409);
    phases.push(
      "24 concurrent quotes/checkouts during worker traffic; expired holds rejected; 32 same-key retries produced one sale",
    );
    for (let i = 0; i < 100; i++) {
      if (
        (await runtime.eventSeat.count({
          where: {
            id: { in: free.slice(45, 49).map((x) => x.id) },
            status: "AVAILABLE",
          },
        })) === 4
      )
        break;
      await new Promise((r) => setTimeout(r, 50));
      if (i === 99) throw new Error("Expired inventory not recovered.");
    }
    const expiryRecoveryMs = Date.now() - expiryStart;
    const bookingWindow = {
      requests: samples.length,
      durationMs: performance.now() - bookingStart,
    };
    bookingWindow.requestsPerSecond =
      bookingWindow.requests / (bookingWindow.durationMs / 1000);
    await stop(worker);
    worker = null;
    const raceUser = users[21],
      raceSeat = free[50].id;
    assert.equal((await hold(raceUser, [raceSeat])).status, 200);
    await owner.seatHold.updateMany({
      where: { eventSeatId: raceSeat },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const { expireHolds } = await import("../backend/src/services/booking.ts");
    const [expiredCheckout] = await Promise.all([
      checkout(raceUser, [raceSeat]),
      expireHolds(runtime),
    ]);
    assert.equal(expiredCheckout.status, 409);
    assert.equal(
      (await runtime.eventSeat.findUniqueOrThrow({ where: { id: raceSeat } }))
        .status,
      "AVAILABLE",
    );
    // Durable outbox: crash a process holding an uncommitted SKIP LOCKED claim.
    const mailUser = users[22],
      mailSeat = free[51].id;
    assert.equal((await hold(mailUser, [mailSeat])).status, 200);
    const mail = await checkout(mailUser, [mailSeat], randomUUID(), {
      deliveryMethod: "email",
    });
    assert.equal(mail.status, 201);
    const job = await runtime.outboxJob.findFirstOrThrow({
      where: { orderId: mail.data.order.id },
    });
    // Defer other pending jobs in this disposable lab so this specific claim is deterministic.
    await owner.outboxJob.updateMany({
      where: { id: { not: job.id }, status: "PENDING" },
      data: { availableAt: new Date(Date.now() + 3600000) },
    });
    const crash = service(
      "outbox-crash",
      process.execPath,
      ["--import", "tsx", "scripts/fixtures/outbox-crash.mjs"],
      env,
    );
    const { readFile } = await import("node:fs/promises");
    for (let i = 0; i < 200; i++) {
      if (
        (
          await readFile(`${privateRoot}/outbox-crash.log`, "utf8").catch(
            (error) => {
              if (error.code === "ENOENT") return "";
              throw error;
            },
          )
        ).includes("OUTBOX_CLAIMED")
      )
        break;
      await new Promise((r) => setTimeout(r, 25));
      if (i === 199) throw new Error("Crash fixture did not claim job.");
    }
    const exited = new Promise((r) => crash.once("exit", r));
    crash.kill("SIGKILL");
    await exited;
    assert.equal(
      crash.signalCode,
      "SIGKILL",
      "Crash fixture must be killed while its transaction is active",
    );
    const afterCrash = await runtime.outboxJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    assert.equal(afterCrash.status, "PENDING");
    assert.equal(afterCrash.attempts, 0);
    const observed = [];
    const nonUtcRunnerDatabase = {
      $transaction: (fn) =>
        runtime.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL TIME ZONE 'Asia/Tehran'`;
          return fn(tx);
        }),
    };
    const failing = new OutboxRunner(
      nonUtcRunnerDatabase,
      {
        deliver: async () => {
          throw new Error("Controlled transport failure.");
        },
      },
      (e) => observed.push(e),
    );
    for (let attempt = 1; attempt <= 10; attempt++) {
      const before = Date.now();
      assert.equal(await failing.runOnce(), 1);
      const row = await runtime.outboxJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      assert.equal(row.attempts, attempt);
      assert.equal(row.status, attempt === 10 ? "FAILED" : "PENDING");
      assert.equal(row.lastError, "TRANSPORT_FAILURE");
      assert.ok(
        row.availableAt.getTime() >=
          before + Math.min(3600000, 1000 * 2 ** (attempt - 1)),
      );
      if (attempt < 10) {
        assert.equal(await failing.runOnce(), 0);
        await owner.outboxJob.update({
          where: { id: job.id },
          data: { availableAt: new Date(Date.now() - 1) },
        });
      }
    }
    assert.equal(observed.filter((e) => e === "job_retry").length, 9);
    assert.equal(observed.filter((e) => e === "job_failed").length, 1);
    // A second durable job succeeds after a failed attempt and local runner restart.
    const mail2Seat = free[52].id;
    assert.equal((await hold(mailUser, [mail2Seat])).status, 200);
    const mail2 = await checkout(mailUser, [mail2Seat], randomUUID(), {
      deliveryMethod: "email",
    });
    assert.equal(mail2.status, 201);
    const job2 = await runtime.outboxJob.findFirstOrThrow({
      where: { orderId: mail2.data.order.id },
    });
    assert.equal(await failing.runOnce(), 1);
    await owner.outboxJob.update({
      where: { id: job2.id },
      data: { availableAt: new Date(Date.now() - 1) },
    });
    const capture = new OutboxRunner(
      runtime,
      new LocalEmailTransport(`${privateRoot}/mail`),
      (e) => observed.push(e),
    );
    assert.equal(await capture.runOnce(), 1);
    assert.equal(await capture.runOnce(), 0);
    assert.equal(
      (await runtime.outboxJob.findUniqueOrThrow({ where: { id: job2.id } }))
        .status,
      "LOCAL_CAPTURED",
    );
    const batchStart = performance.now();
    for (const seat of free.slice(53, 61)) {
      assert.equal((await hold(mailUser, [seat.id])).status, 200);
      assert.equal(
        (
          await checkout(mailUser, [seat.id], randomUUID(), {
            deliveryMethod: "email",
          })
        ).status,
        201,
      );
    }
    const drainStart = performance.now();
    const drained = [
      ...(await Promise.all(
        Array.from({ length: 4 }, () => capture.runOnce()),
      )),
      ...(await Promise.all(
        Array.from({ length: 4 }, () => capture.runOnce()),
      )),
    ];
    assert.equal(
      drained.reduce((n, x) => n + x, 0),
      8,
    );
    assert.equal(await capture.runOnce(), 0);
    const workerDrain = {
      jobs: 8,
      workers: 4,
      durationMs: performance.now() - drainStart,
      includingEnqueueMs: performance.now() - batchStart,
      scope: "Local filesystem capture only; not real provider throughput",
    };
    const { PrismaClient } = await import("@prisma/client");
    const probe = new PrismaClient({
      datasources: { db: { url: env.DATABASE_URL } },
      log: [{ emit: "event", level: "query" }],
    });
    let queries = 0;
    probe.$on("query", () => {
      queries++;
    });
    const { catalog, inventory } =
      await import("../backend/src/services/catalog.ts");
    let queryCounts;
    try {
      queries = 0;
      await catalog(probe);
      const catalogQueries = queries;
      queries = 0;
      await inventory(probe, eventId, undefined, "101", 20, 0);
      const inventory20 = queries;
      queries = 0;
      await inventory(probe, eventId, undefined, "101", 100, 0);
      queryCounts = {
        catalog: catalogQueries,
        inventory20,
        inventory100: queries,
      };
      assert.ok(
        queries <= inventory20 + 1,
        "Inventory query count must not grow with row count",
      );
    } finally {
      await probe.$disconnect();
    }
    phases.push(
      "Worker stopped/crashed: order+job durable, transaction rolled back, backoff respected, tenth failure terminal, restart captured once",
    );
    const budgetUser = await account();
    limited = service(
      "load-limiter",
      process.execPath,
      ["backend/dist/backend/src/server.js"],
      {
        ...env,
        PORT: "23202",
        GLOBAL_RATE_LIMIT: "50000",
        HOLD_RATE_LIMIT: "2",
      },
    );
    for (let i = 0; i < 200; i++) {
      try {
        if ((await fetch("http://127.0.0.1:23202/ready")).ok) break;
      } catch {
        /* Expected transient startup/shutdown probe failure. */
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(
      limited.exitCode,
      null,
      "Limiter API must remain alive before concurrent requests",
    );
    assert.ok(
      (await fetch("http://127.0.0.1:23202/ready")).ok,
      "Limiter API readiness required",
    );
    const burst = await Promise.all(
      Array.from({ length: 20 }, () =>
        api(`/events/${eventId}/hold-seats`, {
          port: 23202,
          method: "POST",
          cookie: budgetUser.cookie,
          body: { seatIds: [] },
        }),
      ),
    );
    assert.equal(burst.filter((r) => r.status === 200).length, 2);
    assert.equal(burst.filter((r) => r.status === 429).length, 18);
    phases.push(
      "20-way Redis budget burst: exactly two accepted, eighteen rate-limited",
    );
    const violations = await inspectIntegrity((sql) =>
      owner.$queryRawUnsafe(sql),
    );
    const percentile = (v, p) =>
      [...v].sort((a, b) => a - b)[Math.max(0, Math.ceil(v.length * p) - 1)];
    const stats = (xs) => ({
      requests: xs.length,
      p50: percentile(
        xs.map((x) => x.ms),
        0.5,
      ),
      p95: percentile(
        xs.map((x) => x.ms),
        0.95,
      ),
      p99: percentile(
        xs.map((x) => x.ms),
        0.99,
      ),
    });
    const durationMs = performance.now() - started;
    const result = {
      passed: true,
      scope:
        "Native localhost, 24 booking users, one API pool of 10; test-only simulation; no production scale claim",
      phases,
      violations,
      requests: samples.length,
      peakConcurrentRequests: peak,
      loadWindowMs: durationMs,
      throughputPerSecond: samples.length / (durationMs / 1000),
      latencyMs: stats(samples),
      byOperation: Object.fromEntries(
        [...new Set(samples.map((x) => x.operation))].map((k) => [
          k,
          stats(samples.filter((x) => x.operation === k)),
        ]),
      ),
      statusCounts: Object.fromEntries(
        [...new Set(samples.map((x) => x.status))].map((k) => [
          k,
          samples.filter((x) => x.status === k).length,
        ]),
      ),
      unexpected5xx: samples.filter((x) => x.status >= 500).length,
      conflictRate:
        samples.filter((x) => x.status === 409).length / samples.length,
      dbPressure: {
        samples: pressure.length,
        maxRuntimeConnections: Math.max(
          0,
          ...pressure.map((x) => x.connections),
        ),
        maxActive: Math.max(0, ...pressure.map((x) => x.active)),
        maxLockWaiters: Math.max(0, ...pressure.map((x) => x.lock_waiters)),
        note: "50ms pg_stat_activity samples include all runtime sessions; not Prisma pool queue depth or exact lock durations",
      },
      workerExpiryRecoveryMs: expiryRecoveryMs,
      bookingWindow,
      workerDrain,
      queryCounts,
      outboxEvents: observed,
      bottleneck:
        "Event-wide FOR UPDATE serializes holds, quotes and checkouts; retain correctness protocol. Benchmark finer-grained sorted event-seat locks in a separate design with expiry/replacement/idempotency writers using the same protocol.",
    };
    assert.equal(result.unexpected5xx, 0);
    await writeFile(
      `${root}/hot-event-load.json`,
      JSON.stringify(result, null, 2),
    );
    return result;
  } finally {
    clearInterval(timer);
    while (monitorBusy) await new Promise((r) => setTimeout(r, 10));
    await stop(worker);
    await stop(limited);
    await stop(server);
  }
}
