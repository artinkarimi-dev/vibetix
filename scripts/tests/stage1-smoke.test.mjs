import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const send = (response, code, body, cookies) => {
  response.writeHead(code, {
    "content-type": "application/json",
    ...(cookies ? { "set-cookie": `${cookies}; HttpOnly; SameSite=Strict; Path=/` } : {}),
  });
  response.end(JSON.stringify(body));
};
const bodyOf = async (request) => {
  let raw = "";
  for await (const part of request) raw += part;
  return raw ? JSON.parse(raw) : {};
};
test("stage 1 smoke script checks the purchase contract and emits a report", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "vibetix-stage1-"));
  const bin = join(dir, "bin");
  await mkdir(bin);
  await writeFile(join(dir, ".env.local"), "APP_ORIGIN=http://127.0.0.1:8080\nALLOW_SIMULATED_PAYMENTS=true\n");
  await writeFile(join(bin, "docker"), '#!/bin/sh\nprintf "1|1|1\\n"\n', { mode: 0o755 });
  const purchaseId = randomUUID();
  const state = { owner: null, sold: false, orders: 0, users: new Map() };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const method = req.method;
    const cookie = /vibetix-session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    const fail = (code = "SEAT_UNAVAILABLE") => send(res, 409, { error: { code } });
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (url.pathname === "/api/v1/catalog") return send(res, 200, { events: [{ id: "test-event", startsAt: "2029-01-01T00:00:00.000Z" }] });
    if (url.pathname === "/api/v1/events/test-event/seats" && method === "GET") return send(res, 200, { seats: [{ id: "test-seat", status: state.sold ? "unavailable" : "available" }] });
    if (url.pathname === "/api/v1/auth/register" && method === "POST") {
      const data = await bodyOf(req);
      state.users.set(data.email, data.password);
      return send(res, 201, { ok: true });
    }
    if (url.pathname === "/api/v1/auth/login" && method === "POST") {
      const data = await bodyOf(req);
      assert.equal(state.users.get(data.email), data.password);
      return send(res, 200, { user: { email: data.email } }, `vibetix-session=${data.email.includes("-buyer-") ? "buyer" : "competitor"}`);
    }
    if (url.pathname === "/api/v1/events/test-event/hold-seats" && method === "POST") {
      if (state.sold || (state.owner && state.owner !== cookie)) return fail();
      state.owner = cookie;
      return send(res, 200, { seatIds: ["test-seat"] });
    }
    if (url.pathname === "/api/v1/quotes" && method === "POST") return send(res, 200, { totals: { grandTotal: 1900 } });
    if (url.pathname === "/api/v1/orders" && method === "POST") {
      assert.equal(cookie, "buyer");
      if (!state.sold) state.orders++;
      state.sold = true;
      return send(res, 201, { order: { id: purchaseId, tickets: [{ id: "ticket" }] } });
    }
    if (url.pathname === `/api/v1/orders/${purchaseId}` && method === "GET") {
      return send(res, 200, { order: { id: purchaseId, tickets: [{ id: "ticket" }] } });
    }
    return send(res, 404, { error: { code: "NOT_FOUND" } });
  });
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  const testPort = server.address().port;
  const child = spawn(process.execPath, ["scripts/stage1-smoke.mjs"], {
    cwd: root,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STAGE1_TEST_ROOT: dir, STAGE1_TEST_BASE: `http://127.0.0.1:${testPort}` },
  });
  let output = "";
  child.stdout.on("data", (chunk) => output += chunk);
  child.stderr.on("data", (chunk) => output += chunk);
  try {
    const code = await new Promise((resolve) => child.once("close", resolve));
    assert.equal(code, 0, output);
    assert.match(output, /PASS 10 checks/);
    assert.equal(state.orders, 1);
    const report = JSON.parse(await readFile(join(dir, "artifacts/stage1/smoke.json"), "utf8"));
    assert.equal(report.passed, true);
    assert.equal(report.checks.length, 10);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });

  }
});
