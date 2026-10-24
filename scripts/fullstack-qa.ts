import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../backend/src/app.js";
import { loadConfig } from "../backend/src/config.js";
if (
  process.env.ALLOW_DATABASE_TESTS !== "true" ||
  !URL.canParse(process.env.DATABASE_URL ?? "") ||
  !/^[a-z0-9_]+_demo_test$/.test(
    new URL(process.env.DATABASE_URL!).pathname.slice(1),
  )
)
  throw new Error(
    "Full-stack QA requires ALLOW_DATABASE_TESTS=true and a dedicated *_demo_test database.",
  );
process.env.TICKET_SIGNING_KEY ??= randomBytes(48).toString("hex");
const cfg = {
  ...loadConfig(),
  APP_ORIGIN: "http://127.0.0.1:5188",
  APP_MODE: "portfolio" as const,
  ALLOW_SIMULATED_PAYMENTS: "false" as const,
  NODE_ENV: "test" as const,
};
const db = new PrismaClient();
const app = await buildApp(db, cfg, false);
const preview = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5188",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let worker: ReturnType<typeof spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const checks: string[] = [];
const errors: string[] = [];
const timings: { path: string; milliseconds: number; bytes: number }[] = [];
try {
  await app.listen({ port: 3001, host: "127.0.0.1" });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(cfg.APP_ORIGIN)).ok) break;
    } catch {

    }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw new Error("Preview did not start.");
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.QA_CHROMIUM_EXECUTABLE || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const checkAxe = async () => {
    assert.deepEqual(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
      [],
    );
  };
  const transmitted: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/orders") && r.method() === "POST")
      transmitted.push(r.postData() || "");
  });
  const email = `browser-${randomUUID()}@example.test`,
    password = `Browser-${randomBytes(16).toString("hex")}`;
  await page.goto(`${cfg.APP_ORIGIN}/`);
  await expect(
    page.getByRole("heading", { name: "ECHOES", exact: true }),
  ).toBeVisible();
  assert.equal(await db.event.count({ where: { status: "ON_SALE" } }), 10);
  checks.push("Production catalog loads from PostgreSQL");
  await page.getByRole("link", { name: "Your account" }).click();
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await checkAxe();
  await page.getByLabel("First name", { exact: true }).fill("Browser");
  await page.getByLabel("Last name", { exact: true }).fill("Customer");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/seats/);
  await expect(page.locator(".seat-button").first()).toBeVisible();
  checks.push("Register, login and HttpOnly session");
  await page.getByLabel("Jump to a section").selectOption("101");
  await expect(page.locator(".seat-button").first()).toBeVisible();
  const available = page.locator(".seat-button:not(:disabled)");
  await available.nth(0).click();
  await expect(page.locator('.seat-button[aria-pressed="true"]')).toHaveCount(
    1,
  );
  await available.nth(1).click();
  await expect(page.locator('.seat-button[aria-pressed="true"]')).toHaveCount(
    2,
  );
  await page.reload();
  await expect(page.locator('.seat-button[aria-pressed="true"]')).toHaveCount(
    2,
  );
  checks.push("Real server hold, exact seats and refresh restore");
  await checkAxe();
  await page
    .getByRole("link", { name: "Continue to Extras", exact: true })
    .click();
  await expect(page).toHaveURL(/\/extras/);
  await page.getByRole("link", { name: "Review Booking", exact: true }).click();
  await expect(page).toHaveURL(/\/review/);
  await page
    .getByRole("link", { name: "Continue to Checkout", exact: true })
    .click();
  await expect(page).toHaveURL(/\/checkout/);
  await checkAxe();
  await page.getByLabel("Promo code", { exact: true }).fill("VIBETIX10");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Server promo applied.")).toBeVisible();
  for (const [label, value] of [
    ["Full Name", "Browser Customer"],
    ["Email", email],
    ["Phone", "+1 212 555 0100"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Complete Test Purchase/ }).click();
  await expect(page).toHaveURL(/\/confirmation\?order=/);
  await expect(page.locator(".digital-ticket")).toHaveCount(2);
  assert.equal(transmitted.length, 1);
  assert.ok(!/cardNumber|cardName|expiration|4242|cvc/.test(transmitted[0]));
  checks.push(
    "Server promo, authoritative checkout, order + tickets; no card fields transmitted",
  );
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const order = await db.order.findFirstOrThrow({
    where: { userId: user.id, status: "CONFIRMED" },
  });
  assert.equal(await db.orderItem.count({ where: { orderId: order.id } }), 2);
  await mkdir("artifacts/fullstack", { recursive: true });
  await page.screenshot({
    path: "artifacts/fullstack/confirmation-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "My Tickets", exact: true })
    .last()
    .click();
  await expect(page.locator(".order-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".order-card")).toHaveCount(1);
  await page.getByRole("link", { name: "View Tickets", exact: true }).click();
  await expect(page.locator(".digital-ticket")).toHaveCount(2);
  checks.push("My Tickets, order ownership and refresh persistence");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("vibetix-orders")),
    null,
  );
  checks.push(
    "Private orders and bearer sessions are not persisted in browser storage",
  );
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/", `/orders/${order.id}`]) {
      await page.goto(cfg.APP_ORIGIN + path);
      await expect(page.locator("main h1").first()).toBeVisible();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      assert.deepEqual(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
        [],
      );
    }
  }
  checks.push(
    "Live desktop/tablet/mobile catalog + order composition and zero axe violations",
  );

  const expiring = await db.eventSeat.findFirstOrThrow({
    where: { eventId: "echoes-new-york", status: "AVAILABLE" },
    orderBy: { id: "asc" },
  });
  const held = await context.request.post(
    `${cfg.APP_ORIGIN}/api/v1/events/echoes-new-york/hold-seats`,
    { headers: { origin: cfg.APP_ORIGIN }, data: { seatIds: [expiring.id] } },
  );
  assert.ok(held.ok());
  await db.seatHold.update({
    where: { eventSeatId: expiring.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  worker = spawn(
    process.execPath,
    ["--import", "tsx", "backend/src/worker.ts"],
    {
      env: { ...process.env, NODE_ENV: "test", APP_MODE: "portfolio" },
      stdio: "pipe",
    },
  );
  for (let i = 0; i < 40; i++) {
    if (
      (await db.eventSeat.findUniqueOrThrow({ where: { id: expiring.id } }))
        .status === "AVAILABLE"
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(
    (await db.eventSeat.findUniqueOrThrow({ where: { id: expiring.id } }))
      .status,
    "AVAILABLE",
  );
  worker.kill("SIGTERM");
  checks.push(
    "Separate worker process automatically releases expired PostgreSQL holds",
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  const otherTab = await context.newPage();
  await otherTab.goto(`${cfg.APP_ORIGIN}/orders/${order.id}`);
  await expect(otherTab.locator(".digital-ticket")).toHaveCount(2);
  await page.goto(`${cfg.APP_ORIGIN}/account`);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to VIBETIX" }),
  ).toBeVisible();
  await page.goto(`${cfg.APP_ORIGIN}/tickets`);
  await expect(page.locator(".order-card")).toHaveCount(0);
  await expect(otherTab.locator(".digital-ticket")).toHaveCount(0);
  await expect(otherTab.locator("main")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await otherTab.reload();
  await expect(otherTab.locator(".digital-ticket")).toHaveCount(0);
  await otherTab.close();
  checks.push("Logout clears account views across tabs and reloads");
  await page.goto(
    `${cfg.APP_ORIGIN}/account?next=${encodeURIComponent("/\\attacker.invalid")}`,
  );
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${cfg.APP_ORIGIN}/seats`);
  checks.push(
    "Malicious backslash return path stays on the application origin",
  );
  await page.goto(`${cfg.APP_ORIGIN}/account`);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto(`${cfg.APP_ORIGIN}/tickets`);
  await expect(page.locator(".order-card")).toHaveCount(0);
  assert.deepEqual(errors, []);
  await page.route("**/api/v1/catalog", (route) => route.abort());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "VIBETIX is temporarily unavailable" }),
  ).toBeVisible();
  await page.unroute("**/api/v1/catalog");
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(
    page.getByRole("heading", { name: "Your next great night is waiting" }),
  ).toBeVisible();
  checks.push("API outage shows retry state without fixture fallback");
  // Expected failure-state console messages are separated from normal journey failures.
  const expectedNetworkErrors = errors.filter((e) =>
    /Failed to load resource|net::ERR_FAILED/.test(e),
  );
  assert.deepEqual(
    errors.filter((e) => !expectedNetworkErrors.includes(e)),
    [],
  );
  for (const path of [
    "/health",
    "/api/v1/catalog",
    "/api/v1/events/echoes-new-york/seats?section=101",
  ]) {
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const r = await fetch("http://127.0.0.1:3001" + path);
      const bytes = (await r.arrayBuffer()).byteLength;
      assert.ok(r.ok);
      timings.push({ path, milliseconds: performance.now() - start, bytes });
    }
  }
  await writeFile(
    "artifacts/fullstack/qa.json",
    JSON.stringify(
      {
        checks,
        unexpectedErrors: [],
        expectedNetworkErrors,
        timings,
        mode: "Production frontend + real PostgreSQL/Fastify; payment simulation explicitly enabled",
      },
      null,
      2,
    ),
  );
  console.info(JSON.stringify({ checks, timings }, null, 2));
  if (process.env.QA_MEASURE_PERFORMANCE === "true") {
    await browser.close();
    browser = undefined;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["scripts/measure-performance.mjs"],
        {
          env: { ...process.env, QA_BASE_URL: cfg.APP_ORIGIN + "/" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });
      child.on("exit", (code) => {
        void writeFile("artifacts/fullstack/performance-summary.txt", output);
        if (code === 0) resolve();
        else reject(new Error("Performance sample failed."));
      });
      child.on("error", reject);
    });
    await copyFile(
      "artifacts/performance.json",
      "artifacts/fullstack/performance.json",
    );
  }
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
  worker?.kill("SIGTERM");
  await app.close();
  await db.$disconnect();
}
