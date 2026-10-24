import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const base = "http://127.0.0.1:5185";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5185",
    "--strictPort",
  ],
  {
    env: {
      ...process.env,
      VITE_USE_FIXTURES: "true",
      VITE_PAYMENT_FAILURE: "true",
      VITE_PAYMENT_DELAY_MS: "200",
    },
    stdio: "ignore",
  },
);
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error("Failure-mode server exited before startup");
    try {
      ready = (await fetch(base)).ok;
    } catch {

    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, "Failure-mode server did not start");
  browser = await chromium.launch({
    executablePath: process.env.QA_CHROMIUM_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(`${base}/seats`);
  await page
    .getByRole("button", { name: "Section 101 row 1 seat 1", exact: true })
    .click();
  await page.goto(`${base}/checkout`);
  for (const [label, value] of [
    ["Full Name", "Alex Test"],
    ["Email", "alex@example.com"],
    ["Phone", "+1 212 555 0100"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Complete Test Purchase/ }).click();
  await page
    .getByText(
      "The simulated payment failed. No order was created. Please try again.",
      { exact: true },
    )
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: /Complete Test Purchase/ })
      .isEnabled(),
  );
  const result = await page.evaluate(() => ({
    orders: JSON.parse(
      localStorage.getItem("vibetix-orders") || '{"state":{"orders":[]}}',
    ).state.orders.length,
    seats: JSON.parse(localStorage.getItem("vibetix-booking")).state
      .selectedSeats.length,
    paymentPersisted:
      /cardNumber|cardName|cvc|expiration|4242424242424242|4242 4242 4242 4242/.test(
        Object.values(localStorage).join(""),
      ),
  }));
  assert.equal(result.orders, 0);
  assert.equal(result.seats, 1);
  assert.equal(result.paymentPersisted, false);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/payment-failure.png",
    fullPage: true,
  });
  await writeFile(
    "artifacts/payment-failure.json",
    JSON.stringify({ passed: true, ...result }, null, 2),
  );
  console.log(
    "Payment failure verified: no order, seat retained, retry enabled, no payment persistence.",
  );
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
