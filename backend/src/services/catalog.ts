import type { Database } from "../database/client.js";
import type {
  Event,
  Extra,
  Seat,
  VenueSection,
} from "../../../packages/shared/src/index.js";
import { fail } from "../utils/errors.js";
export async function catalog(db: Database) {
  const [eventRows, artists, venues, sections, extraRows] = await Promise.all([
    db.event.findMany({
      where: { status: "ON_SALE" },
      orderBy: { date: "asc" },
    }),
    db.artist.findMany(),
    db.venue.findMany(),
    db.section.findMany({ orderBy: { position: "asc" } }),
    db.extra.findMany(),
  ]);
  return {
    events: eventRows.map((e) => ({
      ...(e.presentation as unknown as Event),
      id: e.id,
      name: e.title,
      description: e.description,
      artistId: e.artistId,
      venueId: e.venueId,
      startsAt: e.date.toISOString(),
      doorsAt: e.doorsOpen.toISOString(),
    })),
    artists,
    venues,
    sections: sections.map((s) => ({
      id: s.label,
      venueId: s.venueId,
      name: s.name,
      tierId: s.tier as VenueSection["tierId"],
      level: s.level as VenueSection["level"],
      index: s.position,
    })),
    extras: extraRows.map((e) => ({
      ...(e.presentation as unknown as Extra),
      id: e.id,
      name: e.name,
      priceCents: e.price,
      unit: e.unit,
      maxQuantity: e.maxQuantity,
    })),
  };
}
export async function inventory(
  db: Database,
  eventId: string,
  userId?: string,
  section?: string,
  limit = 100,
  offset = 0,
) {
  if (
    !(await db.event.findFirst({ where: { id: eventId, status: "ON_SALE" } }))
  )
    fail("NOT_FOUND", "Event not found.", 404);
  const items = await db.eventSeat.findMany({
    where: {
      eventId,
      ...(section ? { seat: { section: { label: section } } } : {}),
    },
    include: { seat: { include: { section: true } }, hold: true },
    orderBy: [
      { seat: { section: { position: "asc" } } },
      { seat: { row: "asc" } },
      { seat: { number: "asc" } },
    ],
    take: limit,
    skip: offset,
  });
  const now = new Date();
  return items.map((x): Seat => ({
    id: x.id,
    eventId,
    sectionId: x.seat.section.label,
    section: x.seat.section.label,
    row: x.seat.row,
    number: x.seat.number,
    tierId: x.seat.section.tier as Seat["tierId"],
    priceCents: x.price,
    status:
      x.status === "SOLD" ||
      (x.status === "HELD" &&
        x.hold &&
        x.hold.expiresAt > now &&
        x.hold.userId !== userId)
        ? "unavailable"
        : "available",
  }));
}
