import { z } from "zod";
import type { Order } from "../types";
const text = z.string().min(1).max(1000);
const cents = z.number().int().nonnegative().max(100000000);
const timezone = text.refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
});
const attendee = z.object({ fullName: text, email: z.email(), phone: text });
const ticket = z.object({
  id: text,
  orderId: text,
  eventId: text,
  event: text,
  artist: text,
  venue: text,
  city: text,
  date: z.iso.datetime({ offset: true }),
  timezone,
  section: text,
  row: z.number().int().positive(),
  seat: z.number().int().positive(),
  ticketId: text,
  qrValue: text,
  status: z.literal("valid"),
  priceCents: cents,
});
const seat = z.object({
  id: text,
  eventId: text,
  sectionId: text,
  section: text,
  row: z.number().int().positive(),
  number: z.number().int().positive(),
  tierId: z.enum(["standard", "premium", "vip", "front-row"]),
  priceCents: cents,
  status: z.enum(["available", "selected", "unavailable"]),
});
const totals = z.object({
  ticketSubtotal: cents,
  extrasSubtotal: cents,
  discount: cents,
  serviceFee: cents,
  processingFee: cents,
  tax: cents,
  grandTotal: cents,
  currency: z.literal("USD"),
});
const orderSchema = z
  .object({
    id: text,
    orderNumber: text,
    eventId: text,
    eventName: text,
    artist: text,
    venue: text,
    city: text,
    address: text,
    startsAt: z.iso.datetime({ offset: true }),
    timezone,
    attendee,
    tickets: z.array(ticket).min(1).max(6),
    seats: z.array(seat).min(1).max(6),
    extras: z
      .array(
        z.object({
          id: text,
          name: text,
          quantity: z.number().int().positive().max(6),
          unitPriceCents: cents,
        }),
      )
      .max(5),
    deliveryMethod: z.enum(["mobile", "email"]),
    promo: z.string().max(30).nullable(),
    totals,
    purchaseDate: z.iso.datetime(),
    status: z.literal("confirmed"),
    simulation: z.literal(true),
  })
  .refine(
    (order) =>
      order.tickets.length === order.seats.length &&
      new Set(order.tickets.map((ticket) => ticket.id)).size ===
        order.tickets.length &&
      new Set(order.seats.map((seat) => seat.id)).size === order.seats.length &&
      new Set(order.extras.map((extra) => extra.id)).size ===
        order.extras.length &&
      order.tickets.every(
        (t, index) =>
          t.orderId === order.id &&
          t.eventId === order.eventId &&
          t.section === order.seats[index].section &&
          t.row === order.seats[index].row &&
          t.seat === order.seats[index].number &&
          t.priceCents === order.seats[index].priceCents,
      ) &&
      order.seats.every((seat) => seat.eventId === order.eventId) &&
      order.totals.ticketSubtotal ===
        order.tickets.reduce((sum, ticket) => sum + ticket.priceCents, 0) &&
      order.totals.extrasSubtotal ===
        order.extras.reduce(
          (sum, extra) => sum + extra.quantity * extra.unitPriceCents,
          0,
        ) &&
      order.totals.discount <= order.totals.ticketSubtotal &&
      order.totals.grandTotal ===
        order.totals.ticketSubtotal +
          order.totals.extrasSubtotal -
          order.totals.discount +
          order.totals.serviceFee +
          order.totals.processingFee +
          order.totals.tax,
  );
export function parseStoredOrder(value: unknown): Order | null {
  const result = orderSchema.safeParse(value);
  return result.success ? result.data : null;
}
