import { prepareVisuals } from "./visualHelpers";
import { test, expect, seed } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
const widths = [
  1920, 1600, 1440, 1366, 1280, 1024, 834, 768, 430, 412, 390, 375, 360,
];
const routes = [
  "/",
  "/seats",
  "/extras",
  "/review",
  "/checkout",
  "/confirmation?order=mock-qa-order",
  "/tickets",
];
for (const width of widths)
  test(`seven major screens at ${width}px`, async ({ page, browserName }) => {
    test.setTimeout(120000);
    await seed(page);
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    for (const [index, route] of routes.entries()) {
      await page.goto(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.locator(".route-loading").waitFor({ state: "hidden" });
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(dimensions.document, route).toBeLessThanOrEqual(
        dimensions.viewport + 1,
      );
      await prepareVisuals(page);
      await page.screenshot({
        path: `artifacts/freeze/${browserName}/responsive/${width}-${index}.png`,
        fullPage: true,
      });
    }
  });
for (const width of [1440, 834, 390])
  test(`automated accessibility on major screens at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await seed(page);
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations, route).toEqual([]);
    }
  });
test("focused seat rendering is isolated from timer ticks and arena", async ({
  page,
}) => {
  await page.goto("/seats");
  await expect(page.locator(".seat-button").first()).toBeVisible();
  const snapshot = () =>
    page.locator("[data-render-count]").evaluateAll((nodes) =>
      nodes.map((node) => ({
        id:
          node.getAttribute("data-seat-id") ??
          node.getAttribute("data-section-id") ??
          node.className,
        count: Number(node.getAttribute("data-render-count")),
      })),
    );
  const before = await snapshot();
  expect(before.length).toBeGreaterThan(100);
  await page
    .getByRole("button", { name: "Section 101 row 1 seat 1", exact: true })
    .click();
  const after = await snapshot();
  const changed = after.filter(
    (item, index) => item.count !== before[index]?.count,
  );
  expect(changed).toHaveLength(1);
  expect(changed[0].id).toContain(":101:1:1");
  await expect(page.locator(".hold-timer")).toBeVisible();
  await page.waitForTimeout(2200);
  expect(await snapshot()).toEqual(after);
  console.info(
    "RENDER_PROFILE",
    JSON.stringify({
      mounted: before.length,
      changedOnSeatSelection: changed.length,
      timerChanged: 0,
    }),
  );
});
