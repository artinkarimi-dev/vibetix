import { accountRevision, accountIsCurrent } from "./authScope";
import { useBookingStore } from "../store/bookingStore";
import { useEventStore } from "../store/eventStore";
import { events } from "../data/events";
import { artists } from "../data/artists";
import { venues } from "../data/venues";
import { extras } from "../data/extras";
import {
  venueSections,
  replaceInventory,
  replaceAvailability,
} from "../data/inventory";
import { rebuildSearchIndex } from "../services/search";
import type { Event, Artist, Venue, Extra, VenueSection, Seat } from "../types";
import { request } from "./client";
export async function loadCatalog() {
  const data = await request<{
    events: Event[];
    artists: Artist[];
    venues: Venue[];
    extras: Extra[];
    sections: VenueSection[];
  }>("/catalog");
  if (
    !Array.isArray(data.events) ||
    !Array.isArray(data.sections) ||
    !Array.isArray(data.artists) ||
    !Array.isArray(data.venues) ||
    !Array.isArray(data.extras)
  )
    throw new Error("The event catalog is unavailable. Please retry.");
  events.splice(0, events.length, ...data.events);
  artists.splice(0, artists.length, ...data.artists);
  venues.splice(0, venues.length, ...data.venues);
  extras.splice(0, extras.length, ...data.extras);
  venueSections.splice(0, venueSections.length, ...data.sections);
  rebuildSearchIndex();
  useBookingStore.getState().reset();
  useEventStore.setState({ favorites: [] });
  try {
    localStorage.removeItem("vibetix-orders");
  } catch {

  }
}
export async function loadSection(eventId: string, section: string) {
  const revision = accountRevision();
  const page = (offset: number) =>
    request<{ seats: Seat[]; nextOffset: number | null }>(
      `/events/${encodeURIComponent(eventId)}/seats?section=${encodeURIComponent(section)}&limit=200&offset=${offset}`,
    );
  const [first, availability] = await Promise.all([
    page(0),
    request<{ sections: { id: string; available: number }[] }>(
      `/events/${encodeURIComponent(eventId)}/availability`,
    ),
  ]);
  const seats = [...first.seats];
  let offset = first.nextOffset;
  while (offset !== null && offset !== undefined) {
    if (!accountIsCurrent(revision)) return;
    if (offset <= 0 || offset > 100000)
      throw new Error("Invalid inventory pagination.");
    const next = await page(offset);
    seats.push(...next.seats);
    if (
      next.nextOffset !== null &&
      next.nextOffset !== undefined &&
      next.nextOffset <= offset
    )
      throw new Error("Inventory pagination did not advance.");
    offset = next.nextOffset;
  }
  if (!accountIsCurrent(revision)) return;
  replaceInventory(eventId, section, seats);
  replaceAvailability(eventId, availability.sections);
}
