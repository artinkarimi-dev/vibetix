import { accountRevision, accountIsCurrent } from "./authScope";
import { getPricedExtras } from "../utils/pricing";
import { post } from "./client";
import type { Order, PricingTotals } from "../types";
import { useBookingStore } from "../store/bookingStore";
export const selection = () => {
  const s = useBookingStore.getState();
  return {
    eventId: s.eventId,
    seatIds: s.selectedSeats,
    extras: s.selectedExtras,
    promo: s.promoCode,
  };
};
export const replaceHold = (eventId: string, seatIds: string[]) =>
  post<{ seatIds: string[]; expiresAt: string | null }>(
    `/events/${encodeURIComponent(eventId)}/hold-seats`,
    { seatIds },
  );
export const fetchQuote = () =>
  post<{ totals: PricingTotals }>("/quotes", selection());
export const purchase = (attendee: Order["attendee"], key: string) =>
  post<{ order: Order }>(
    "/orders",
    {
      ...selection(),
      attendee,
      deliveryMethod: useBookingStore.getState().deliveryMethod,
      paymentOutcome: "success",
    },
    { "Idempotency-Key": key },
  );
let seatQueue: Promise<void> = Promise.resolve();
export function changeSeats(
  eventId: string,
  change: (ids: string[]) => string[],
) {
  const revision = accountRevision();
  const task = seatQueue.then(async () => {
    if (!accountIsCurrent(revision)) return;
    const state = useBookingStore.getState();
    if (state.eventId !== eventId)
      throw new Error("The event changed. Choose seats again.");
    const ids = change(state.selectedSeats);
    if (ids.length > 6)
      throw new Error("You can select up to 6 seats per booking.");
    const result = await replaceHold(eventId, ids);
    if (
      !accountIsCurrent(revision) ||
      useBookingStore.getState().eventId !== eventId
    )
      return;
    useBookingStore.setState({
      selectedSeats: result.seatIds,
      seatHoldExpiresAt: result.expiresAt ? Date.parse(result.expiresAt) : null,
      notice: null,
      selectedExtras: Object.fromEntries(
        getPricedExtras(state.selectedExtras, ids.length).map((extra) => [
          extra.id,
          extra.quantity,
        ]),
      ),
      ...(!ids.length ? { selectedExtras: {}, promoCode: "" } : {}),
    });
  });
  seatQueue = task.catch(() => {});
  return task;
}
