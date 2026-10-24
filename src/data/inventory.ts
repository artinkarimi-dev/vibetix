import { FIXTURE_MODE } from "../api/client";
import type { Seat, SeatRow, VenueSection } from "../types";
import { ticketTiers } from "./ticketTiers";
import { events } from "./events";
import { venues } from "./venues";

export const venueSections: VenueSection[] = venues.flatMap((venue) => [
  ...Array.from({ length: 6 }, (_, i) => ({
    id: ["A1", "A2", "A3", "B1", "B2", "B3"][i],
    name: `Floor ${["A1", "A2", "A3", "B1", "B2", "B3"][i]}`,
    tierId: i < 3 ? ("front-row" as const) : ("vip" as const),
    level: "floor" as const,
    index: i,
    venueId: venue.id,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    id: String(101 + i),
    name: `Section ${101 + i}`,
    tierId: "premium" as const,
    level: "lower" as const,
    index: i,
    venueId: venue.id,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    id: String(201 + i),
    name: `Section ${201 + i}`,
    tierId: "standard" as const,
    level: "upper" as const,
    index: i,
    venueId: venue.id,
  })),
]);
export const getSections = (venueId: string) =>
  venueSections.filter((s) => s.venueId === venueId);
const inventoryCache = new Map<string, { seats: Seat[]; rows: SeatRow[] }>();
const hash = (value: string) =>
  [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
export function getSectionInventory(eventId: string, section: VenueSection) {
  const key = `${eventId}:${section.venueId}:${section.id}`;
  const cached = inventoryCache.get(key);
  if (cached) return cached;
  if (!FIXTURE_MODE) return { seats: [], rows: [] };
  const seats: Seat[] = [];
  const rows: SeatRow[] = [];
  const priceCents = Math.round(
    (ticketTiers.find((t) => t.id === section.tierId)?.price ?? 89) * 100,
  );
  for (let row = 1; row <= 8; row++) {
    const seatIds: string[] = [];
    for (let number = 1; number <= 12; number++) {
      const id = `${eventId}:${section.id}:${row}:${number}`;
      seatIds.push(id);
      const unavailable =
        !(row === 1 && number <= 2) &&
        (hash(eventId) + section.index * 31 + row * 7 + number * 11) % 17 < 3;
      seats.push({
        id,
        eventId,
        sectionId: section.id,
        section: section.id,
        row,
        number,
        tierId: section.tierId,
        priceCents,
        status: unavailable ? "unavailable" : "available",
      });
    }
    rows.push({
      id: `${key}:${row}`,
      sectionId: section.id,
      number: row,
      seatIds,
    });
  }
  const result = { seats, rows };
  inventoryCache.set(key, result);
  return result;
}
export function resolveSeat(
  eventId: string,
  venueId: string,
  seatId: string,
): Seat | undefined {
  const sectionId = seatId.split(":")[1];
  const section = venueSections.find(
    (s) => s.venueId === venueId && s.id === sectionId,
  );
  return section
    ? getSectionInventory(eventId, section).seats.find((s) => s.id === seatId)
    : undefined;
}
export function getSectionAvailability(eventId: string, section: VenueSection) {
  if (!FIXTURE_MODE) return availability.get(`${eventId}:${section.id}`) ?? 0;
  return getSectionInventory(eventId, section).seats.filter(
    (s) => s.status === "available",
  ).length;
}

const availability = new Map<string, number>();
export function replaceAvailability(
  eventId: string,
  sections: { id: string; available: number }[],
) {
  for (const section of sections)
    availability.set(`${eventId}:${section.id}`, section.available);
}
export function replaceInventory(
  eventId: string,
  sectionId: string,
  seats: Seat[],
) {
  const section = venueSections.find(
    (s) =>
      s.id === sectionId &&
      s.venueId === events.find((e) => e.id === eventId)?.venueId,
  );
  if (!section) return;
  inventoryCache.set(`${eventId}:${section.venueId}:${sectionId}`, {
    seats,
    rows: [...new Set(seats.map((s) => s.row))]
      .sort((a, b) => a - b)
      .map((number) => ({
        id: `${eventId}:${sectionId}:${number}`,
        sectionId,
        number,
        seatIds: seats.filter((s) => s.row === number).map((s) => s.id),
      })),
  });
}
