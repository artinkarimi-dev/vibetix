import { SimulationPayments, PortfolioDemoPayments } from "./payments.js";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  orderRequest,
  quoteRequest,
} from "../../../packages/shared/src/index.js";
import type { Order, Seat } from "../../../packages/shared/src/index.js";
import type { Database } from "../database/client.js";
import type { Config } from "../config.js";
import { fail } from "../utils/errors.js";
import { priceOrder } from "./pricing.js";
type Tx = Prisma.TransactionClient;
export async function lockEvent(tx: Tx, eventId: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "Event" WHERE id=${eventId} FOR UPDATE`;
  if (!rows.length) fail("NOT_FOUND", "Event not found.", 404);
}
async function databaseNow(tx: Tx) {
  return (
    await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`
  )[0].now;
}
async function releaseExpired(tx: Tx, eventId: string, now: Date) {
  const expired = await tx.seatHold.findMany({
    where: { expiresAt: { lte: now }, eventSeat: { eventId } },
    select: { eventSeatId: true },
  });
  const ids = expired.map((h) => h.eventSeatId);
  if (ids.length) {
    await tx.eventSeat.updateMany({
      where: { id: { in: ids }, status: "HELD" },
      data: { status: "AVAILABLE" },
    });
    await tx.seatHold.deleteMany({ where: { eventSeatId: { in: ids } } });
  }
  return ids.length;
}
export async function expireHolds(db: Database, stopping = () => false) {
  const events = await db.event.findMany({
    where: {
      inventory: { some: { hold: { expiresAt: { lte: new Date() } } } },
    },
    select: { id: true },
  });
  let count = 0;
  for (const event of events) {
    if (stopping()) break;
    count += await db.$transaction(async (tx) => {
      await lockEvent(tx, event.id);
      return releaseExpired(tx, event.id, await databaseNow(tx));
    });
  }
  return count;
}
export async function holdSeats(
  db: Database,
  cfg: Config,
  userId: string,
  eventId: string,
  seatIds: string[],
) {
  return db.$transaction(
    async (tx) => {
      await lockEvent(tx, eventId);
      const now = await databaseNow(tx);
      await releaseExpired(tx, eventId, now);
      const event = await tx.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      if (seatIds.length && (event.status !== "ON_SALE" || event.date <= now))
        fail("NOT_ON_SALE", "This event is not on sale.");
      const current = await tx.seatHold.findMany({
        where: { userId, eventSeat: { eventId } },
        orderBy: { expiresAt: "asc" },
      });
      const items = await tx.eventSeat.findMany({
        where: { eventId, id: { in: seatIds } },
        include: { hold: true },
      });
      if (items.length !== seatIds.length)
        fail("INVALID_SEATS", "A seat does not belong to this event.", 400);
      if (
        items.some(
          (x) =>
            x.status === "SOLD" ||
            (x.status === "HELD" && x.hold?.userId !== userId),
        )
      )
        fail(
          "SEAT_UNAVAILABLE",
          "Another customer holds or owns this seat. Refresh availability.",
        );
      const removed = current
        .filter((h) => !seatIds.includes(h.eventSeatId))
        .map((h) => h.eventSeatId);
      await tx.seatHold.deleteMany({
        where: { eventSeatId: { in: removed }, userId },
      });
      await tx.eventSeat.updateMany({
        where: { id: { in: removed }, status: "HELD" },
        data: { status: "AVAILABLE" },
      });
      const expiresAt =
        current[0]?.expiresAt ??
        new Date(now.getTime() + cfg.HOLD_SECONDS * 1000);
      for (const item of items) {
        await tx.seatHold.upsert({
          where: { eventSeatId: item.id },
          create: { eventSeatId: item.id, userId, expiresAt },
          update: { userId, expiresAt },
        });
      }
      await tx.eventSeat.updateMany({
        where: { id: { in: seatIds } },
        data: { status: "HELD" },
      });
      return {
        seatIds,
        expiresAt: seatIds.length ? expiresAt.toISOString() : null,
      };
    },
    { maxWait: 5000, timeout: 15000 },
  );
}
async function buildQuote(
  tx: Tx,
  userId: string,
  input: z.infer<typeof quoteRequest>,
  now: Date,
) {
  const event = await tx.event.findUnique({
    where: { id: input.eventId },
    include: { artist: true, venue: true },
  });
  if (!event || event.status !== "ON_SALE" || event.date <= now)
    return fail("NOT_ON_SALE", "This event is not on sale.");
  const items = await tx.eventSeat.findMany({
    where: { id: { in: input.seatIds }, eventId: input.eventId },
    include: { hold: true, seat: { include: { section: true } } },
    orderBy: { id: "asc" },
  });
  if (
    items.length !== input.seatIds.length ||
    items.some(
      (x) =>
        x.status !== "HELD" ||
        x.hold?.userId !== userId ||
        x.hold.expiresAt <= now,
    )
  )
    fail("HOLD_EXPIRED", "A valid hold owned by your account is required.");
  const [extras, promo] = await Promise.all([
    tx.extra.findMany(),
    input.promo
      ? tx.promoCode.findUnique({ where: { code: input.promo } })
      : null,
  ]);
  return {
    event,
    items,
    ...priceOrder(
      items.map((x) => x.price),
      input.extras,
      extras,
      promo,
      input.promo,
      now,
    ),
  };
}
export async function quote(
  db: Database,
  userId: string,
  input: z.infer<typeof quoteRequest>,
) {
  return db.$transaction(async (tx) => {
    await lockEvent(tx, input.eventId);
    const q = await buildQuote(tx, userId, input, await databaseNow(tx));
    return { totals: q.totals, extras: q.extras };
  });
}
const fingerprint = (input: z.infer<typeof orderRequest>) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        ...input,
        seatIds: [...input.seatIds].sort(),
        extras: Object.fromEntries(
          Object.entries(input.extras).sort(([a], [b]) => a.localeCompare(b)),
        ),
      }),
    )
    .digest("hex");
export const ticketToken = (id: string, key: string) =>
  `${id}.${createHmac("sha256", key).update(`ticket:v1:${id}`).digest("base64url")}`;
export const activeTicketIds = (order: {
  status: string;
  event: { status: string; date: Date };
  items: { ticket: { id: string; status: string } | null }[];
}) =>
  new Set(
    order.status === "CONFIRMED" &&
      order.event.status === "ON_SALE" &&
      order.event.date.getTime() > Date.now()
      ? order.items.flatMap((item) =>
          item.ticket?.status === "VALID" ? [item.ticket.id] : [],
        )
      : [],
  );
export function orderResponse(
  snapshot: Prisma.JsonValue,
  key: string,
  eligibleIds: ReadonlySet<string>,
  currentEvent?: { status: string; date: Date },
): Order {
  const order = snapshot as unknown as Order;
  const ticketNotice =
    currentEvent?.status === "CANCELLED"
      ? "This fictional event was cancelled. Demo tickets are unavailable."
      : currentEvent?.status === "DRAFT"
        ? "This fictional event is unpublished. Demo tickets are unavailable."
        : currentEvent && currentEvent.date.getTime() <= Date.now()
          ? "This fictional event has started. Demo tickets have expired."
          : eligibleIds.size < order.tickets.length
            ? "Some demo tickets are unavailable because they were used or revoked."
            : currentEvent &&
                currentEvent.date.getTime() !== Date.parse(order.startsAt)
              ? "This fictional event was rescheduled. Tickets and calendar use the current event time."
              : undefined;
  return {
    ...order,
    ...(currentEvent
      ? { currentStartsAt: currentEvent.date.toISOString() }
      : {}),
    ticketNotice,
    tickets: order.tickets
      .filter((t) => eligibleIds.has(t.id))
      .map((t) => ({
        ...t,
        qrValue: ticketToken(t.id, key),
        ...(currentEvent ? { date: currentEvent.date.toISOString() } : {}),
      })),
  };
}
type CheckoutResult = (
  { failed: true; order: { id: string } } | { failed: false; order: Order }
) & { replayed?: boolean };
export async function createOrder(
  db: Database,
  cfg: Config,
  userId: string,
  input: z.infer<typeof orderRequest>,
  key: string,
): Promise<CheckoutResult> {
  if (
    cfg.APP_MODE !== "portfolio" &&
    (cfg.NODE_ENV === "production" || cfg.ALLOW_SIMULATED_PAYMENTS !== "true")
  )
    fail(
      "PAYMENTS_DISABLED",
      "Payment processing has not been configured.",
      503,
    );
  const requestHash = fingerprint(input);
  return db.$transaction(
    async (tx) => {
      await lockEvent(tx, input.eventId);
      const prior = await tx.order.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
        include: {
          event: { select: { status: true, date: true } },
          items: {
            include: { ticket: { select: { id: true, status: true } } },
          },
        },
      });
      if (prior) {
        if (prior.requestHash !== requestHash)
          fail(
            "IDEMPOTENCY_CONFLICT",
            "This request key was already used for different checkout data.",
          );
        if (prior.status === "FAILED")
          return {
            failed: true as const,
            order: { id: prior.id },
            replayed: true,
          };
        return {
          replayed: true,
          failed: false as const,
          order: orderResponse(
            prior.snapshot,
            cfg.TICKET_SIGNING_KEY,
            activeTicketIds(prior),
            prior.event,
          ),
        };
      }
      const now = await databaseNow(tx);
      const { event, items, totals, extras } = await buildQuote(
        tx,
        userId,
        input,
        now,
      );
      const orderId = randomUUID();
      const seats: Seat[] = items.map((x) => ({
        id: x.id,
        eventId: event.id,
        sectionId: x.seat.section.label,
        section: x.seat.section.label,
        row: x.seat.row,
        number: x.seat.number,
        tierId: x.seat.section.tier as Seat["tierId"],
        priceCents: x.price,
        status: "available",
      }));
      const payment = (
        cfg.APP_MODE === "portfolio"
          ? new PortfolioDemoPayments(cfg)
          : new SimulationPayments(cfg)
      ).authorize(orderId, totals.grandTotal, input.paymentOutcome);
      const failed = payment.status === "FAILED";
      const tickets = failed
        ? []
        : seats.map((seat) => {
            const id = randomUUID();
            return {
              id,
              orderId,
              eventId: event.id,
              event: event.title,
              artist: event.artist.name,
              venue: event.venue.name,
              city: event.venue.city,
              date: event.date.toISOString(),
              timezone: event.venue.timezone,
              section: seat.section,
              row: seat.row,
              seat: seat.number,
              ticketId: `VBT-${id}`,
              qrValue: "",
              status: "valid" as const,
              priceCents: seat.priceCents,
            };
          });
      const snapshot: Order = {
        id: orderId,
        orderNumber: `VBT-${orderId.slice(0, 8).toUpperCase()}`,
        eventId: event.id,
        eventName: event.title,
        artist: event.artist.name,
        venue: event.venue.name,
        city: event.venue.city,
        address: event.venue.address,
        startsAt: event.date.toISOString(),
        timezone: event.venue.timezone,
        attendee: input.attendee,
        tickets,
        seats,
        extras,
        deliveryMethod: input.deliveryMethod,
        promo: input.promo || null,
        totals,
        purchaseDate: now.toISOString(),
        status: "confirmed",
        simulation: true,
      };
      await tx.order.create({
        data: {
          id: orderId,
          userId,
          eventId: event.id,
          status: failed ? "FAILED" : "CONFIRMED",
          subtotal: totals.ticketSubtotal + totals.extrasSubtotal,
          fees: totals.serviceFee + totals.processingFee,
          tax: totals.tax,
          total: totals.grandTotal,
          discount: totals.discount,
          idempotencyKey: key,
          requestHash,
          snapshot: (failed
            ? { ...snapshot, status: "failed" }
            : snapshot) as unknown as Prisma.InputJsonValue,
          payment: { create: payment },
        },
      });
      if (!failed)
        for (const [index, item] of items.entries())
          await tx.orderItem.create({
            data: {
              orderId,
              eventSeatId: item.id,
              price: item.price,
              ticket: {
                create: {
                  id: tickets[index].id,
                  ticketCode: tickets[index].ticketId,
                  qrCode: createHash("sha256")
                    .update(
                      ticketToken(tickets[index].id, cfg.TICKET_SIGNING_KEY),
                    )
                    .digest("hex"),
                },
              },
            },
          });
      await tx.eventSeat.updateMany({
        where: { id: { in: input.seatIds } },
        data: { status: failed ? "AVAILABLE" : "SOLD" },
      });
      await tx.seatHold.deleteMany({
        where: { eventSeatId: { in: input.seatIds }, userId },
      });
      if (!failed && input.deliveryMethod === "email")
        await tx.outboxJob.create({
          data: { orderId, kind: "BOOKING_CONFIRMATION" },
        });
      if (failed) return { failed: true as const, order: { id: orderId } };
      return {
        failed: false as const,
        order: orderResponse(
          snapshot as unknown as Prisma.JsonValue,
          cfg.TICKET_SIGNING_KEY,
          new Set(tickets.map((ticket) => ticket.id)),
          event,
        ),
      };
    },
    { maxWait: 5000, timeout: 15000 },
  );
}
