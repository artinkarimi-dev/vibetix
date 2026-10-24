import type { Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
export { expect };
export const test = base.extend<{ browserErrors: void }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error")
          errors.push(`${message.text()} ${message.location().url}`);
      });
      await use();
      expect(errors, "Unexpected browser errors").toEqual([]);
    },
    { auto: true },
  ],
});
import { events } from "../../src/data/events";
import { getSections, getSectionInventory } from "../../src/data/inventory";
import { createMockOrder } from "../../src/services/orders";
export const primary = events[0];
const section = getSections(primary.venueId).find((s) => s.id === "101")!;
const seats = getSectionInventory(primary.id, section).seats.slice(0, 2);
export function bookingFixture(expired = false) {
  return {
    eventId: primary.id,
    viewingSection: "101",
    selectedSeats: seats.map((s) => s.id),
    selectedExtras: { lounge: 1 },
    attendee: null,
    deliveryMethod: "email" as const,
    promoCode: "VIBETIX10",
    seatHoldExpiresAt: Date.now() + (expired ? -10000 : 600000),
  };
}
export const orderFixture = () =>
  createMockOrder(
    bookingFixture(),
    seats,
    {
      fullName: "Alex Test",
      email: "alex@example.com",
      phone: "+1 212 555 0100",
    },
    "qa-order",
  );
export async function seed(page: Page, expired = false) {
  const booking = bookingFixture(expired);
  const order = orderFixture();
  await page.addInitScript(
    ({ booking, order }) => {
      if (!localStorage.getItem("vibetix-qa-seeded")) {
        localStorage.setItem(
          "vibetix-booking",
          JSON.stringify({ state: booking, version: 1 }),
        );
        localStorage.setItem(
          "vibetix-orders",
          JSON.stringify({ state: { orders: [order] }, version: 1 }),
        );
        localStorage.setItem("vibetix-qa-seeded", "true");
      }
    },
    { booking, order },
  );
  return order;
}
