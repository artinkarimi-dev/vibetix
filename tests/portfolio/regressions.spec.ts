import { test, expect, type Page } from "@playwright/test";
import { events } from "../../src/data/events";
import { artists } from "../../src/data/artists";
import { venues } from "../../src/data/venues";
import { extras } from "../../src/data/extras";
import { venueSections } from "../../src/data/inventory";
import { orderFixture } from "../e2e/fixtures";
async function api(
  page: Page,
  options: {
    empty?: boolean;
    nonseed?: boolean;
    noSections?: boolean;
    hold?: boolean;
    seats?: boolean;
  } = {},
) {
  const order = orderFixture();
  const control = { invalid: false, fail: false, details: 0, seatPages: 0 };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (path.endsWith("/catalog"))
      return route.fulfill({
        json: {
          events: options.empty
            ? []
            : options.nonseed
              ? events.filter((e) => e.id !== "echoes-new-york")
              : events,
          artists,
          venues,
          extras,
          sections: options.noSections ? [] : venueSections,
        },
      });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          user: options.empty
            ? null
            : {
                id: "contract-user",
                firstName: "Demo",
                lastName: "Only",
                email: "demo@example.test",
                role: "CUSTOMER",
              },
        },
      });
    if (path.endsWith("/holds"))
      return route.fulfill({
        json: {
          holds: options.hold
            ? [
                {
                  eventId: "unpublished",
                  seatId: "opaque-id",
                  section: "101",
                  expiresAt: new Date(Date.now() + 60000).toISOString(),
                },
              ]
            : [],
        },
      });
    if (path.endsWith("/favorites"))
      return route.fulfill({ json: { favorites: [] } });
    if (path.endsWith("/orders"))
      return route.fulfill({
        json: { orders: options.empty ? [] : [order], nextCursor: null },
      });
    if (path.includes("/orders/")) {
      control.details++;
      if (control.fail)
        return route.fulfill({
          status: 503,
          json: { error: { message: "Demo API temporarily unavailable." } },
        });
      return route.fulfill({
        json: {
          order: {
            ...order,
            tickets: control.invalid ? [] : order.tickets,
            ticketNotice: control.invalid
              ? "This fictional event was cancelled. Demo tickets are unavailable."
              : undefined,
          },
        },
      });
    }
    if (options.hold && path.includes("/unpublished/"))
      return route.fulfill({
        status: 404,
        json: { error: { message: "Event not found." } },
      });
    if (path.endsWith("/availability"))
      return route.fulfill({
        json: { sections: [{ id: "101", available: 201 }] },
      });
    if (path.endsWith("/seats")) {
      control.seatPages++;
      const offset = Number(url.searchParams.get("offset"));
      return route.fulfill({
        json: {
          seats: Array.from({ length: offset ? 1 : 200 }, (_, i) => ({
            id: `opaque-${offset + i}`,
            eventId: "echoes-new-york",
            sectionId: "101",
            section: "101",
            row: Math.floor((offset + i) / 12) + 1,
            number: ((offset + i) % 12) + 1,
            tierId: "premium",
            priceCents: 15900,
            status: "available",
          })),
          nextOffset: offset ? null : 200,
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: { message: "Not found." } },
    });
  });
  return control;
}
test("empty catalog leaves account and ticket routes usable", async ({
  page,
}) => {
  let privateOrderRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/orders")
      privateOrderRequests++;
  });
  await api(page, { empty: true });
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Sign in to VIBETIX" }),
  ).toBeVisible();
  await page.goto("/tickets");
  await expect(
    page.getByRole("heading", { name: "Your next great night is waiting" }),
  ).toBeVisible();
  expect(privateOrderRequests).toBe(0);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "No shows are listed right now." }),
  ).toBeVisible();
});
test("home and fallback CTA follow a nonseed catalog", async ({ page }) => {
  await api(page, { nonseed: true });
  await page.goto("/");
  await expect(page.locator("#event-title")).toHaveText("ECHOES");
  await expect(
    page.getByRole("link", { name: "Choose Your Seats", exact: true }),
  ).toHaveAttribute("href", /echoes-chicago/);
  await page.goto("/artists");
  await expect(
    page.getByRole("link", { name: "Get Tickets", exact: true }),
  ).toHaveAttribute("href", "/events/echoes-chicago#tickets");
});
test("cancelled restored hold does not block saved order history", async ({
  page,
}) => {
  await api(page, { hold: true });
  await page.goto("/tickets");
  await expect(
    page.getByRole("link", { name: "View Tickets", exact: true }),
  ).toBeVisible();
});
test("cached QR is revalidated and focus handles cancellation and restoration", async ({
  page,
}) => {
  const state = await api(page);
  await page.goto("/tickets");
  await page.getByRole("link", { name: "View Tickets", exact: true }).click();
  await expect(page.locator(".digital-ticket")).toHaveCount(2);
  expect(state.details).toBeGreaterThan(0);
  state.invalid = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText(
      "This fictional event was cancelled. Demo tickets are unavailable.",
    ),
  ).toBeVisible();
  await expect(page.locator(".digital-ticket")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Print Tickets" }),
  ).toBeDisabled();
  state.invalid = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".digital-ticket")).toHaveCount(2);
});
test("failed refresh does not keep displaying a cached QR", async ({
  page,
}) => {
  const state = await api(page);
  await page.goto(`/orders/${orderFixture().id}`);
  await expect(page.locator(".digital-ticket")).toHaveCount(2);
  state.fail = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Cannot load this order" }),
  ).toBeVisible();
  await expect(page.locator(".digital-ticket")).toHaveCount(0);
  state.fail = false;
  await page.getByRole("button", { name: "Retry order" }).click();
  await expect(page.locator(".digital-ticket")).toHaveCount(2);
});
test("missing venue sections show an explicit unavailable state", async ({
  page,
}) => {
  await api(page, { noSections: true });
  await page.goto("/seats?event=echoes-new-york");
  await expect(
    page.getByRole("heading", { name: "Seats are unavailable" }),
  ).toBeVisible();
});
test("all section inventory pages are rendered", async ({ page }) => {
  const state = await api(page, { seats: true });
  await page.goto("/seats?event=echoes-new-york");
  await expect(page.locator("[data-seat-id]")).toHaveCount(201);
  expect(state.seatPages).toBe(2);
});
