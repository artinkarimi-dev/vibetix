import { test, expect, seed } from "./fixtures";

test("immediate Enter searches the current input rather than stale suggestions", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByRole("combobox");
  await input.fill("Alex");
  await expect(page.getByRole("option").first()).toContainText("Alex");

  await input.evaluate((node) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(node, "zzzznoresults");
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await input.press("Enter");
  await expect(page).toHaveURL("/");
  await expect(page.getByText(/No results for/)).toContainText("zzzznoresults");
});

test("blocked storage is visible and selecting seats still works", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await page.goto("/seats");
  await page
    .getByRole("button", { name: "Section 101 row 1 seat 1", exact: true })
    .click();
  await expect(
    page.getByText(/Browser storage is unavailable or full/),
  ).toBeVisible();
  await expect(page.locator('.seat-button[aria-pressed="true"]')).toHaveCount(
    1,
  );
});

test("section keyboard interaction and row filtering do not select a ticket", async ({
  page,
}) => {
  await page.goto("/seats");
  const section = page.locator('[data-section-id="102"]');
  await section.focus();
  await section.press("Space");
  await expect(
    page.getByRole("heading", { name: "Section 102", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Filter seat rows").selectOption("7");
  await expect(page.locator(".seat-row")).toHaveCount(1);
  await expect(page.locator('.seat-button[aria-pressed="true"]')).toHaveCount(
    0,
  );
});

test("active hold expires while checkout is open", async ({ page }) => {
  await seed(page);
  await page.clock.install();
  await page.goto("/checkout");
  await expect(
    page.getByRole("heading", { name: /The last step/ }),
  ).toBeVisible();
  await page.clock.fastForward(11 * 60 * 1000);
  await expect(page).toHaveURL(/seats/);
  await expect(page.getByRole("alert")).toContainText(/expired/);
});

test("leaving checkout during simulated processing cancels the pending mock purchase", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/checkout");
  for (const [label, value] of [
    ["Full Name", "Alex Test"],
    ["Email", "alex@example.com"],
    ["Phone", "+1 212 555 0100"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Complete Test Purchase/ }).click();
  await expect(
    page.getByRole("button", { name: /Processing test purchase/ }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await expect(page).toHaveURL(/review/);
  await page.waitForTimeout(3200);
  const count = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("vibetix-orders")!).state.orders.length,
  );
  expect(count).toBe(1);
  await expect(page).toHaveURL(/review/);
});

test("tickets offer a real calendar download and an event-only copy link", async ({
  page,
  browserName,
}) => {
  const order = await seed(page);
  if (browserName === "chromium")
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/orders/${order.id}`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Add to Calendar" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${order.orderNumber}.ics`);
  const stream = await download.createReadStream();
  let calendar = "";
  for await (const chunk of stream) calendar += chunk.toString();
  expect(calendar).toContain("BEGIN:VEVENT");
  expect(calendar).toContain("DTSTART:20270321T000000Z");
  expect(calendar).not.toContain(order.attendee.email);
  await page.getByRole("button", { name: "Copy Link" }).click();
  if (browserName === "chromium") {
    await expect(page.getByRole("status")).toHaveText("Event link copied.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      /\/events\/echoes-new-york$/,
    );
  } else {
    await expect(page.getByRole("status")).toContainText(
      /Event link copied|Copy this event link/,
    );
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".site-header")).toBeHidden();
  await expect(page.locator(".ticket-actions")).toBeHidden();
  await expect(page.locator(".digital-ticket").first()).toBeVisible();
  await page.emulateMedia({ media: "screen" });
});

test("offscreen preview preserves geometry and renders before viewing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const preview = page.locator("[data-deferred-preview]");
  await expect(preview).toHaveAttribute("data-preview-ready", "false");
  const before = await preview.boundingBox();
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toHaveAttribute("data-preview-ready", "true");
  await expect(preview.locator("path")).not.toHaveCount(0);
  expect((await preview.boundingBox())?.height).toBe(before?.height);
});
