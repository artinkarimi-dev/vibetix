import { prepareVisuals } from "./visualHelpers";
import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
for (const width of [1440, 834, 390])
  test(`discovery compositions and accessibility at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["events", "artists", "venues", "favorites"]) {
      await page.goto(`/${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      await prepareVisuals(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: `artifacts/freeze/${browserName}/discovery-${route}-${width}.png`,
        fullPage: true,
      });
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations, route).toEqual([]);
    }
  });
