import { FIXTURE_MODE } from "../api/client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { browserStorage } from "./storage";
import { events, PRIMARY_EVENT_ID } from "../data/events";
import { getSections, resolveSeat } from "../data/inventory";
import {
  calculatePricing,
  validatePromo,
  getPricedExtras,
} from "../utils/pricing";
import type { Attendee, Booking, DeliveryMethod, Seat } from "../types";
export const MAX_SEATS = 6;
export const HOLD_DURATION_MS = Math.max(
  1000,
  Number(import.meta.env.VITE_SEAT_HOLD_MS) || 10 * 60 * 1000,
);
const emptyBooking: Booking = {
  eventId: null,
  viewingSection: null,
  selectedSeats: [],
  selectedExtras: {},
  attendee: null,
  deliveryMethod: "mobile",
  promoCode: "",
  seatHoldExpiresAt: null,
};
interface BookingState extends Booking {
  completedOrder: string | null;
  notice: string | null;
  startEvent: (eventId: string, preferredTier?: string) => void;
  viewSection: (sectionId: string) => void;
  toggleSeat: (seatId: string) => string | null;
  removeSeat: (seatId: string) => void;
  setExtra: (extraId: string, quantity: number) => void;
  setAttendee: (attendee: Attendee) => void;
  setDelivery: (method: DeliveryMethod) => void;
  applyPromo: (code: string) => { valid: boolean; message: string };
  expireHold: () => void;
  clearNotice: () => void;
  completeBooking: (orderId: string) => void;
  reset: () => void;
}
export function getBookingSeats(
  state: Pick<Booking, "eventId" | "selectedSeats">,
): Seat[] {
  const event = events.find((e) => e.id === state.eventId);
  if (!event) return [];
  return state.selectedSeats
    .map((id) => resolveSeat(event.id, event.venueId, id))
    .filter((seat): seat is Seat =>
      Boolean(seat && seat.status === "available"),
    );
}
const normalizeExtras = (values: Record<string, number>, count: number) =>
  Object.fromEntries(
    getPricedExtras(values, count).map((extra) => [extra.id, extra.quantity]),
  );
export const useBookingStore = create<BookingState>()(
  persist(
    (set, get) => ({
      ...emptyBooking,
      completedOrder: null,
      notice: null,
      startEvent: (eventId, preferredTier) => {
        const event = events.find((e) => e.id === eventId);
        if (!event) return;
        const current = get();
        if (
          !FIXTURE_MODE &&
          current.eventId &&
          current.eventId !== eventId &&
          current.selectedSeats.length
        ) {
          void import("../api/bookingApi")
            .then((api) => api.replaceHold(current.eventId!, []))
            .catch(() =>
              set({
                notice:
                  "Previous seats could not be released; the server will expire the hold.",
              }),
            );
        }
        if (current.eventId === eventId) {
          if (
            current.seatHoldExpiresAt &&
            current.seatHoldExpiresAt <= Date.now()
          )
            current.expireHold();
          if (!get().selectedSeats.length && preferredTier) {
            const section = getSections(event.venueId).find(
              (s) => s.tierId === preferredTier,
            );
            if (section) set({ viewingSection: section.id });
          }
          return;
        }
        const section =
          getSections(event.venueId).find((s) => s.tierId === preferredTier) ??
          getSections(event.venueId)[0];
        set({
          ...emptyBooking,
          eventId,
          viewingSection: section?.id ?? null,
          completedOrder: null,
          notice: current.selectedSeats.length
            ? "Your previous selection was cleared because you switched events."
            : null,
        });
      },
      viewSection: (sectionId) => {
        const event = events.find((e) => e.id === get().eventId);
        if (event && getSections(event.venueId).some((s) => s.id === sectionId))
          set({ viewingSection: sectionId });
      },
      toggleSeat: (seatId) => {
        if (!FIXTURE_MODE) {
          const eventId = get().eventId;
          if (eventId)
            void import("../api/bookingApi")
              .then((api) =>
                api.changeSeats(eventId, (ids) =>
                  ids.includes(seatId)
                    ? ids.filter((id) => id !== seatId)
                    : [...ids, seatId],
                ),
              )
              .catch((error) => set({ notice: error.message }));
          return null;
        }
        const current = get();
        if (
          current.seatHoldExpiresAt &&
          current.seatHoldExpiresAt <= Date.now()
        ) {
          current.expireHold();
          return "Your seat hold expired. Please select your seats again.";
        }
        const seat = getBookingSeats({
          eventId: current.eventId,
          selectedSeats: [seatId],
        })[0];
        if (!seat) return "This seat is unavailable.";
        if (current.selectedSeats.includes(seatId)) {
          current.removeSeat(seatId);
          return null;
        }
        if (current.selectedSeats.length >= MAX_SEATS)
          return "You can select up to 6 seats per booking.";
        set({
          selectedSeats: [...current.selectedSeats, seatId],
          seatHoldExpiresAt:
            current.seatHoldExpiresAt ?? Date.now() + HOLD_DURATION_MS,
          notice: null,
          completedOrder: null,
        });
        return null;
      },
      removeSeat: (seatId) => {
        if (!FIXTURE_MODE) {
          const eventId = get().eventId;
          if (eventId)
            void import("../api/bookingApi")
              .then((api) =>
                api.changeSeats(eventId, (ids) =>
                  ids.filter((id) => id !== seatId),
                ),
              )
              .catch((error) => set({ notice: error.message }));
          return;
        }
        const state = get();
        const selectedSeats = state.selectedSeats.filter((id) => id !== seatId);
        set({
          selectedSeats,
          selectedExtras: normalizeExtras(
            state.selectedExtras,
            selectedSeats.length,
          ),
          seatHoldExpiresAt: selectedSeats.length
            ? state.seatHoldExpiresAt
            : null,
          promoCode:
            selectedSeats.length &&
            validatePromo(
              state.promoCode,
              calculatePricing(
                getBookingSeats({ eventId: state.eventId, selectedSeats }),
                {},
              ).ticketSubtotal,
            ).valid
              ? state.promoCode
              : "",
        });
      },
      setExtra: (extraId, quantity) => {
        const state = get();
        if (!state.selectedSeats.length) return;
        set({
          selectedExtras: normalizeExtras(
            { ...state.selectedExtras, [extraId]: quantity },
            state.selectedSeats.length,
          ),
        });
      },
      setAttendee: (attendee) => set({ attendee }),
      setDelivery: (deliveryMethod) => set({ deliveryMethod }),
      applyPromo: (code) => {
        const state = get();
        const result = validatePromo(
          code,
          calculatePricing(getBookingSeats(state), state.selectedExtras)
            .ticketSubtotal,
        );
        if (result.valid) set({ promoCode: result.code });
        return result;
      },
      expireHold: () => {
        const state = get();
        if (state.seatHoldExpiresAt && state.seatHoldExpiresAt <= Date.now())
          set({
            selectedSeats: [],
            selectedExtras: {},
            seatHoldExpiresAt: null,
            promoCode: "",
            notice:
              "Your seat hold expired. Your seats have been released. Please choose seats again.",
          });
      },
      clearNotice: () => set({ notice: null }),
      completeBooking: (orderId) =>
        set({ ...emptyBooking, completedOrder: orderId, notice: null }),
      reset: () => set({ ...emptyBooking, completedOrder: null, notice: null }),
    }),
    {
      name: "vibetix-booking",
      version: 1,
      storage: browserStorage,
      partialize: (state) => ({
        eventId: state.eventId,
        viewingSection: state.viewingSection,
        selectedSeats: state.selectedSeats,
        selectedExtras: state.selectedExtras,
        deliveryMethod: state.deliveryMethod,
        promoCode: state.promoCode,
        seatHoldExpiresAt: state.seatHoldExpiresAt,
        completedOrder: state.completedOrder,
      }),
      merge: (persisted, current) => {
        const value = (
          persisted && typeof persisted === "object" ? persisted : {}
        ) as Partial<BookingState>;
        const eventId =
          typeof value.eventId === "string" &&
          events.some((e) => e.id === value.eventId)
            ? value.eventId
            : null;
        const hold =
          typeof value.seatHoldExpiresAt === "number" &&
          Number.isFinite(value.seatHoldExpiresAt) &&
          value.seatHoldExpiresAt > Date.now()
            ? value.seatHoldExpiresAt
            : null;
        const selectedSeats = hold
          ? getBookingSeats({
              eventId,
              selectedSeats: Array.isArray(value.selectedSeats)
                ? [
                    ...new Set(
                      value.selectedSeats.filter(
                        (id): id is string => typeof id === "string",
                      ),
                    ),
                  ].slice(0, MAX_SEATS)
                : [],
            }).map((s) => s.id)
          : [];
        const venueId = events.find((event) => event.id === eventId)?.venueId;
        const viewingSection =
          venueId &&
          typeof value.viewingSection === "string" &&
          getSections(venueId).some(
            (section) => section.id === value.viewingSection,
          )
            ? value.viewingSection
            : null;
        const promo = validatePromo(
          typeof value.promoCode === "string" ? value.promoCode : "",
          calculatePricing(getBookingSeats({ eventId, selectedSeats }), {})
            .ticketSubtotal,
        );
        return {
          ...current,
          notice:
            !hold &&
            Array.isArray(value.selectedSeats) &&
            value.selectedSeats.length
              ? "Your saved seat hold expired or is invalid. Please choose seats again."
              : null,
          eventId,
          viewingSection,
          selectedSeats: [...new Set(selectedSeats)],
          selectedExtras: selectedSeats.length
            ? normalizeExtras(
                value.selectedExtras && typeof value.selectedExtras === "object"
                  ? value.selectedExtras
                  : {},
                selectedSeats.length,
              )
            : {},
          deliveryMethod: value.deliveryMethod === "email" ? "email" : "mobile",
          promoCode: selectedSeats.length && promo.valid ? promo.code : "",
          seatHoldExpiresAt: selectedSeats.length ? hold : null,
          completedOrder:
            typeof value.completedOrder === "string"
              ? value.completedOrder
              : null,
        };
      },
    },
  ),
);
export function ensureBookingEvent() {
  const state = useBookingStore.getState();
  if (!state.eventId) state.startEvent(PRIMARY_EVENT_ID);
}
