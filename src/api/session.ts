import {
  accountRevision,
  accountIsCurrent,
  invalidateAccount,
} from "./authScope";
import { request } from "./client";
import type { Order } from "../types";
import { useOrderStore } from "../store/orderStore";
import { useBookingStore } from "../store/bookingStore";
import { useEventStore } from "../store/eventStore";
import { loadSection } from "./catalogApi";
export function clearAccount() {
  invalidateAccount();
  useOrderStore.setState({ orders: [] });
  useBookingStore.getState().reset();
  useEventStore.setState({ favorites: [] });
}
export async function restoreAccount(revision = accountRevision()) {
  const [{ orders }, { favorites }, { holds }] = await Promise.all([
    request<{ orders: Order[] }>("/orders"),
    request<{ favorites: string[] }>("/favorites"),
    request<{
      holds: {
        seatId: string;
        eventId: string;
        section: string;
        expiresAt: string;
      }[];
    }>("/holds"),
  ]);
  if (!accountIsCurrent(revision)) return;
  useOrderStore.setState({ orders });
  useEventStore.setState({ favorites });
  const previous = useBookingStore.getState();
  const eventId =
    (holds.some((h) => h.eventId === previous.eventId)
      ? previous.eventId
      : holds[0]?.eventId) ?? null;
  const owned = holds.filter((h) => h.eventId === eventId);
  if (!owned.length) {
    useBookingStore.getState().reset();
    return;
  }
  try {
    for (const section of new Set(owned.map((h) => h.section)))
      await loadSection(eventId!, section);
  } catch {
    if (accountIsCurrent(revision)) {
      useBookingStore.getState().reset();
      useBookingStore.setState({
        notice:
          "Previous seats are no longer available. Your saved orders are unchanged.",
      });
    }
    return;
  }
  if (!accountIsCurrent(revision)) return;
  useBookingStore.getState().startEvent(eventId!);
  useBookingStore.setState({
    selectedSeats: owned.map((h) => h.seatId),
    viewingSection: owned[0].section,
    seatHoldExpiresAt: Math.min(...owned.map((h) => Date.parse(h.expiresAt))),
  });
}
