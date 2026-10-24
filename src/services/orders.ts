import { getEventDetails } from "./catalog";
import { resolveSeat } from "../data/inventory";
import { calculatePricing, getPricedExtras } from "../utils/pricing";
import type { Attendee, Booking, Order, Seat } from "../types";
export function createMockOrder(
  booking: Booking,
  seats: Seat[],
  attendee: Attendee,
  id: string = crypto.randomUUID(),
  now = new Date(),
): Order {
  const details = booking.eventId
    ? getEventDetails(booking.eventId)
    : undefined;
  if (
    !details ||
    !seats.length ||
    seats.length > 6 ||
    !booking.seatHoldExpiresAt ||
    booking.seatHoldExpiresAt <= now.getTime()
  )
    throw new Error("Your seats are no longer held. Please select them again.");
  const { event, artist, venue } = details;
  const canonical = booking.selectedSeats.map((id) =>
    resolveSeat(event.id, venue.id, id),
  );
  if (
    new Set(booking.selectedSeats).size !== seats.length ||
    canonical.length !== seats.length ||
    canonical.some(
      (seat, index) =>
        !seat || seat.status !== "available" || seat.id !== seats[index].id,
    )
  )
    throw new Error("Your selected seats changed. Please review your booking.");
  seats = canonical.filter((seat): seat is Seat => Boolean(seat));
  const totals = calculatePricing(
    seats,
    booking.selectedExtras,
    booking.promoCode,
  );
  const orderId = `mock-${id}`;
  return {
    id: orderId,
    orderNumber: `VBT-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
    eventId: event.id,
    eventName: event.name,
    artist: artist.name,
    venue: venue.name,
    city: venue.city,
    address: venue.address,
    startsAt: event.startsAt,
    timezone: venue.timezone,
    attendee: { ...attendee },
    tickets: seats.map((seat, index) => {
      const ticketId = `${orderId}-T${index + 1}`;
      return {
        id: ticketId,
        ticketId,
        orderId,
        eventId: event.id,
        event: event.name,
        artist: artist.name,
        venue: venue.name,
        city: venue.city,
        date: event.startsAt,
        timezone: venue.timezone,
        section: seat.section,
        row: seat.row,
        seat: seat.number,
        qrValue: `vibetix:mock-ticket:${ticketId}`,
        priceCents: seat.priceCents,
        status: "valid",
      };
    }),
    seats: seats.map((s) => ({ ...s })),
    extras: getPricedExtras(booking.selectedExtras, seats.length),
    deliveryMethod: booking.deliveryMethod,
    promo: booking.promoCode || null,
    totals,
    purchaseDate: now.toISOString(),
    status: "confirmed",
    simulation: true,
  };
}
