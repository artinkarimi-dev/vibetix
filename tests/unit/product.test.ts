import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { calculatePricing, validatePromo } from "../../src/utils/pricing";
import { getSectionInventory, getSections } from "../../src/data/inventory";
import { events } from "../../src/data/events";
import {
  useBookingStore,
  getBookingSeats,
  HOLD_DURATION_MS,
} from "../../src/store/bookingStore";
import { createMockOrder } from "../../src/services/orders";
import { parseStoredOrder } from "../../src/utils/orderValidation";
import { calendarContents } from "../../src/utils/ticketActions";
import { checkoutSchema } from "../../src/utils/checkoutValidation";
const event = events[0];
const section = getSections(event.venueId).find((s) => s.id === "101")!;
const available = getSectionInventory(event.id, section).seats.filter(
  (s) => s.status === "available",
);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
  useBookingStore.getState().reset();
  useBookingStore.getState().startEvent(event.id);
});
afterEach(() => vi.useRealTimers());
describe("pricing in cents", () => {
  it("calculates one central quote, rounded once per line", () => {
    expect(
      calculatePricing(
        [{ priceCents: 15900 }, { priceCents: 15900 }],
        { lounge: 1 },
        "VIBETIX10",
      ),
    ).toEqual({
      ticketSubtotal: 31800,
      extrasSubtotal: 6500,
      discount: 3180,
      serviceFee: 2290,
      processingFee: 350,
      tax: 3351,
      grandTotal: 41111,
      currency: "USD",
    });
  });
  it("supports all promos and rejects invalid/minimum codes", () => {
    expect(validatePromo(" echoes25 ", 10000).valid).toBe(true);
    expect(validatePromo("ECHOES25", 8900).valid).toBe(false);
    expect(validatePromo("toString", 31800).valid).toBe(false);
    expect(
      calculatePricing([{ priceCents: 15900 }], {}, "WELCOME15").discount,
    ).toBe(2385);
    expect(
      calculatePricing([{ priceCents: 15900 }], {}, "ECHOES25").discount,
    ).toBe(2500);
  });
  it("has no empty-booking fees, clamps per-person extras and nonfinite inputs", () => {
    expect(calculatePricing([], {}).grandTotal).toBe(0);
    expect(calculatePricing([], { parking: 1, lounge: 1 }).grandTotal).toBe(0);
    expect(
      calculatePricing([{ priceCents: 15900 }], { lounge: 100, parking: NaN })
        .extrasSubtotal,
    ).toBe(6500);
  });
});
describe("inventory and holds", () => {
  it("has 46 stable sections and exact stable cached rows/seats", () => {
    expect(getSections(event.venueId)).toHaveLength(46);
    expect(getSectionInventory(event.id, section)).toBe(
      getSectionInventory(event.id, section),
    );
    expect(getSectionInventory(event.id, section).rows).toHaveLength(8);
    expect(getSectionInventory(event.id, section).seats).toHaveLength(96);
  });
  it("viewing a section selects no tickets; unavailable seats cannot be selected", () => {
    const state = useBookingStore.getState();
    state.viewSection("102");
    expect(useBookingStore.getState().selectedSeats).toEqual([]);
    const unavailable = getSectionInventory(event.id, section).seats.find(
      (s) => s.status === "unavailable",
    )!;
    expect(state.toggleSeat(unavailable.id)).toMatch(/unavailable/);
  });
  it("caps at six, toggles and does not renew the hold with later seats", () => {
    for (const seat of available.slice(0, 6))
      expect(useBookingStore.getState().toggleSeat(seat.id)).toBeNull();
    const hold = useBookingStore.getState().seatHoldExpiresAt;
    vi.advanceTimersByTime(5000);
    expect(useBookingStore.getState().toggleSeat(available[6].id)).toMatch(/6/);
    useBookingStore.getState().toggleSeat(available[0].id);
    useBookingStore.getState().toggleSeat(available[0].id);
    expect(useBookingStore.getState().seatHoldExpiresAt).toBe(hold);
    expect(getBookingSeats(useBookingStore.getState())).toHaveLength(6);
  });
  it("releases expired selection and extras using a timestamp", () => {
    useBookingStore.getState().toggleSeat(available[0].id);
    useBookingStore.getState().setExtra("lounge", 1);
    vi.advanceTimersByTime(HOLD_DURATION_MS + 1);
    useBookingStore.getState().expireHold();
    expect(useBookingStore.getState().selectedSeats).toEqual([]);
    expect(useBookingStore.getState().selectedExtras).toEqual({});
    expect(useBookingStore.getState().notice).toMatch(/expired/);
  });
  it("reduces per-person extras when seats are removed and rejects NaN", () => {
    available
      .slice(0, 2)
      .forEach((s) => useBookingStore.getState().toggleSeat(s.id));
    useBookingStore.getState().setExtra("lounge", 6);
    expect(useBookingStore.getState().selectedExtras.lounge).toBe(2);
    useBookingStore.getState().removeSeat(available[0].id);
    expect(useBookingStore.getState().selectedExtras.lounge).toBe(1);
    useBookingStore.getState().setExtra("lounge", NaN);
    expect(useBookingStore.getState().selectedExtras.lounge).toBeUndefined();
    useBookingStore.getState().setExtra("parking", 1);
    useBookingStore.getState().removeSeat(available[1].id);
    expect(useBookingStore.getState().selectedExtras).toEqual({});
  });
});
describe("checkout and durable mock order boundary", () => {
  it("validates contact and consent, rejecting any card input", () => {
    const valid = {
      fullName: "Alex Fan",
      email: "alex@example.com",
      phone: "+1 212 555 0100",
      consent: true,
    };
    expect(checkoutSchema.safeParse(valid).success).toBe(true);
    for (const patch of [
      { email: "broken" },
      { cardNumber: "4111 1111 1111 1111" },
      { consent: false },
      { cvc: "12" },
    ])
      expect(checkoutSchema.safeParse({ ...valid, ...patch }).success).toBe(
        false,
      );
  });
  it("creates two actual tickets without any payment fields; rejects damaged saved orders", () => {
    available
      .slice(0, 2)
      .forEach((s) => useBookingStore.getState().toggleSeat(s.id));
    const state = useBookingStore.getState();
    state.setExtra("lounge", 1);
    const order = createMockOrder(
      useBookingStore.getState(),
      getBookingSeats(state),
      {
        fullName: "Alex Fan",
        email: "alex@example.com",
        phone: "+1 212 555 0100",
      },
      "test-123",
      new Date(),
    );
    expect(order.tickets).toHaveLength(2);
    expect(order.tickets.map((t) => t.seat)).toEqual([1, 2]);
    const calendar = calendarContents({
      ...order,
      eventName: "ECHOES\rInjected\nLine",
    });
    expect(calendar).toContain("DTSTART:20270321T000000Z");
    expect(calendar).toContain("ECHOES\\nInjected\\nLine");
    expect(calendar).not.toContain(order.attendee.email);
    expect(parseStoredOrder(order)).toEqual(order);
    expect(JSON.stringify(order)).not.toMatch(
      /cardNumber|cvc|expiration|cardName/,
    );
    expect(
      parseStoredOrder({ id: "damaged", simulation: true, tickets: [] }),
    ).toBeNull();
    expect(
      parseStoredOrder({
        ...order,
        totals: { ...order.totals, grandTotal: 0 },
      }),
    ).toBeNull();
    expect(parseStoredOrder({ ...order, timezone: "invalid/zone" })).toBeNull();
    expect(
      parseStoredOrder({
        ...order,
        tickets: [order.tickets[0], order.tickets[0]],
      }),
    ).toBeNull();
    expect(
      parseStoredOrder({
        ...order,
        tickets: order.tickets.map((ticket) => ({ ...ticket, seat: 99 })),
      }),
    ).toBeNull();
  });
  it("rejects order creation after expiry", () => {
    useBookingStore.getState().toggleSeat(available[0].id);
    const state = useBookingStore.getState();
    vi.advanceTimersByTime(HOLD_DURATION_MS + 1);
    expect(() =>
      createMockOrder(state, getBookingSeats(state), {
        fullName: "Alex Fan",
        email: "alex@example.com",
        phone: "5550100",
      }),
    ).toThrow(/held/);
  });
});
