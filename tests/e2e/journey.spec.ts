import { test, expect, seed } from "./fixtures";
test("complete persisted two-seat journey with validation and actual tickets", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Selected", exact: true }).click();
  await page
    .getByRole("link", { name: "Choose Your Seats", exact: true })
    .click();
  await page.getByLabel("Jump to a section").selectOption("102");
  const first = page.getByRole("button", {
    name: "Section 102 row 1 seat 1",
    exact: true,
  });
  const second = page.getByRole("button", {
    name: "Section 102 row 1 seat 2",
    exact: true,
  });
  await first.click();
  await second.click();
  await page
    .getByRole("button", { name: "Remove section 102 row 1 seat 1" })
    .click();
  await first.click();
  await page.reload();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("link", { name: "Continue to Extras", exact: true })
    .click();
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "VIP Lounge Access" }) })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await page.getByRole("link", { name: "Review Booking", exact: true }).click();
  await expect(page.getByTestId("grand-total")).toHaveText("$448.50");
  await page.getByLabel("Promo code", { exact: true }).fill("BADCODE");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText(/That promo code is not valid/)).toBeVisible();
  await page.getByLabel("Promo code", { exact: true }).fill("VIBETIX10");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("grand-total")).toHaveText("$411.11");
  await page
    .getByRole("link", { name: "Continue to Checkout", exact: true })
    .click();
  await page.getByLabel("Full Name", { exact: true }).fill("Alex Test");
  await page.getByLabel("Email", { exact: true }).fill("broken");
  await page.getByLabel("Phone", { exact: true }).fill("+1 212 555 0100");
  await expect(page.getByLabel("Card Number", { exact: true })).toHaveCount(0);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Complete Test Purchase/ }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("alex@example.com");
  await page.getByLabel("Email Tickets").check();
  await page.getByRole("button", { name: /Complete Test Purchase/ }).click();
  await expect(page).toHaveURL(/confirmation\?order=mock-/);
  await expect(page.locator(".digital-ticket")).toHaveCount(2);
  await expect(page.getByText(/No email has been sent/)).toBeVisible();
  await expect(page.locator(".confirmation-info")).toContainText("$411.11");
  const storage = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith("vibetix-"))
      .map(([, value]) => value)
      .join(""),
  );
  expect(storage).not.toMatch(
    /4242424242424242|4242 4242 4242 4242|cardNumber|cvc|expiration|cardName/,
  );
  await page
    .getByRole("link", { name: "My Tickets", exact: true })
    .last()
    .click();
  await expect(page.locator(".order-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".order-card")).toHaveCount(1);
  await page.getByRole("link", { name: "View Tickets", exact: true }).click();
  await expect(page).toHaveURL(/orders\/mock-/);
  await expect(page.locator(".digital-ticket")).toHaveCount(2);
});
test("guards, missing records, search, favorites and history", async ({
  page,
}) => {
  await page.goto("/checkout");
  await expect(page).toHaveURL(/seats/);
  await page.goto("/events/absent");
  await expect(
    page.getByRole("heading", { name: "This show isn’t in our lineup." }),
  ).toBeVisible();
  await page.goto("/orders/absent");
  await expect(
    page.getByRole("heading", { name: /Order not found/ }),
  ).toBeVisible();
  await page.goto("/absent");
  await expect(
    page.getByRole("heading", { name: "This page missed the encore" }),
  ).toBeVisible();
  await page.goto("/");
  const search = page.getByRole("combobox", {
    name: "Search artists, events, venues, and cities",
  });
  await search.fill("zzzznoresults");
  await expect(page.getByText(/No results for/)).toBeVisible();
  await search.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await search.fill("Maya");
  await expect(page.getByRole("option").first()).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page).toHaveURL(/events\/maya-afterglow|artists\/maya/);
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(/events\/maya-afterglow|artists\/maya/);
  await page.goto("/");
  await page.getByRole("button", { name: "Save event to favorites" }).click();
  await page.goto("/favorites");
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page.getByRole("button", { name: /Unfavorite/ }).click();
  await expect(
    page.getByRole("heading", { name: /Save a show. Start a story./ }),
  ).toBeVisible();
});
test("expired saved hold releases seats and redirects safely", async ({
  page,
}) => {
  await seed(page, true);
  await page.goto("/checkout");
  await expect(page).toHaveURL(/seats/);
  await expect(page.getByRole("alert")).toContainText(/expired/);
  await expect(page.locator('.seat-button[aria-pressed="true"]')).toHaveCount(
    0,
  );
});
test("six-seat limit and unavailable controls", async ({ page }) => {
  await page.goto("/seats");
  const seats = page.locator(".seat-button:not(:disabled)");
  for (let i = 0; i < 7; i++) await seats.nth(i).click();
  await expect(page.locator('.seat-button[aria-pressed="true"]')).toHaveCount(
    6,
  );
  await expect(page.getByRole("alert")).toContainText("up to 6");
  await expect(page.locator(".seat-button:disabled").first()).toBeDisabled();
});
