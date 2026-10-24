import { test, expect } from "./fixtures";

test("keyboard focus, search dismissal, mobile navigation and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  const input = page.getByRole("combobox");
  await input.focus();
  await input.fill("Maya");
  await expect(page.getByRole("option").first()).toBeVisible();
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", /.+/);
  await input.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(input).toBeFocused();
  expect(
    await page
      .locator(".search-form")
      .evaluate((node) => getComputedStyle(node).outlineStyle),
  ).toBe("solid");
  await input.focus();
  await input.fill("Alex");
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.getByRole("link", { name: "Favorites", exact: true }).focus();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.focus();
  await menu.press("Enter");
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).press("Enter");
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toHaveCount(0);
  expect(
    await page
      .locator("html")
      .evaluate((node) => getComputedStyle(node).scrollBehavior),
  ).toBe("auto");
  expect(
    await page
      .locator(".hero-cta")
      .evaluate((node) => getComputedStyle(node).transitionDuration),
  ).toBe("0s");
});
