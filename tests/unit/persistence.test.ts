import { afterEach, describe, expect, it } from "vitest";
import {
  useBookingStore,
  HOLD_DURATION_MS,
  getBookingSeats,
} from "../../src/store/bookingStore";
import { events } from "../../src/data/events";
import { getSectionInventory, getSections } from "../../src/data/inventory";

const event = events[0];
const seats = getSectionInventory(
  event.id,
  getSections(event.venueId)[6],
).seats.filter((s) => s.status === "available");
const merge = useBookingStore.persist.getOptions().merge!;
afterEach(() => useBookingStore.getState().reset());
describe("untrusted saved bookings", () => {
  it("deduplicates seats before applying the six-seat cap and clamps extras to real people", () => {
    const result = merge(
      {
        eventId: event.id,
        selectedSeats: [seats[0].id, seats[0].id, seats[1].id],
        seatHoldExpiresAt: Date.now() + HOLD_DURATION_MS,
        selectedExtras: { lounge: 3 },
        viewingSection: "missing",
        promoCode: "garbage",
      },
      useBookingStore.getState(),
    );
    expect(result.selectedSeats).toHaveLength(2);
    expect(result.selectedExtras.lounge).toBe(2);
    expect(result.viewingSection).toBeNull();
    expect(result.promoCode).toBe("");
    expect(getBookingSeats(result)).toHaveLength(2);
  });
  it("drops all extras and promos with an expired or empty selection", () => {
    const result = merge(
      {
        eventId: event.id,
        selectedSeats: [seats[0].id],
        seatHoldExpiresAt: Date.now() - 1,
        selectedExtras: { parking: 1, lounge: 1 },
        promoCode: "VIBETIX10",
      },
      useBookingStore.getState(),
    );
    expect(result.selectedSeats).toEqual([]);
    expect(result.selectedExtras).toEqual({});
    expect(result.promoCode).toBe("");
    expect(result.seatHoldExpiresAt).toBeNull();
    expect(result.notice).toMatch(/expired/);
  });
});
