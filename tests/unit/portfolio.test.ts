import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/api/client")>()),
  FIXTURE_MODE: false,
}));
import { loadCatalog, loadSection } from "../../src/api/catalogApi";
import { restoreAccount, clearAccount } from "../../src/api/session";
import { useOrderStore } from "../../src/store/orderStore";
import { useBookingStore } from "../../src/store/bookingStore";
import { events, defaultEventId } from "../../src/data/events";
import { artists } from "../../src/data/artists";
import { venues } from "../../src/data/venues";
import { extras } from "../../src/data/extras";
import { venueSections, getSectionInventory } from "../../src/data/inventory";
import { request } from "../../src/api/client";
import type { Order } from "../../src/types";
const saved = {
  events: [...events],
  artists: [...artists],
  venues: [...venues],
  extras: [...extras],
  sections: [...venueSections],
};
afterEach(() => {
  events.splice(0, events.length, ...saved.events);
  artists.splice(0, artists.length, ...saved.artists);
  venues.splice(0, venues.length, ...saved.venues);
  extras.splice(0, extras.length, ...saved.extras);
  venueSections.splice(0, venueSections.length, ...saved.sections);
  clearAccount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("a valid empty catalog does not prevent account restoration", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ ...saved, events: [] }))),
  );
  await loadCatalog();
  expect(events).toEqual([]);
  expect(defaultEventId()).toBeUndefined();
});
it("featured event falls back to the actual live catalog", () => {
  events.splice(0, events.length, { ...saved.events[0], id: "another-show" });
  expect(defaultEventId()).toBe("another-show");
});
it("an unavailable restored hold cannot discard account order history", async () => {
  const order = { id: "receipt" } as Order;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith("/orders")
          ? Response.json({ orders: [order] })
          : url.endsWith("/favorites")
            ? Response.json({ favorites: [] })
            : url.endsWith("/holds")
              ? Response.json({
                  holds: [
                    {
                      seatId: "opaque",
                      eventId: "unpublished",
                      section: "101",
                      expiresAt: new Date(Date.now() + 60000).toISOString(),
                    },
                  ],
                })
              : Response.json(
                  { error: { message: "Event not found." } },
                  { status: 404 },
                ),
      ),
    ),
  );
  await restoreAccount();
  expect(useOrderStore.getState().orders).toEqual([order]);
  expect(useBookingStore.getState().selectedSeats).toEqual([]);
});
it("fresh same-ID server orders replace stale signed ticket state", () => {
  useOrderStore
    .getState()
    .saveOrder({ id: "same", tickets: [{ id: "old" }] } as Order);
  useOrderStore.getState().saveOrder({
    id: "same",
    tickets: [],
    ticketNotice: "Revoked",
  } as unknown as Order);
  expect(useOrderStore.getState().orders).toHaveLength(1);
  expect(useOrderStore.getState().orders[0].tickets).toEqual([]);
});
it("section inventory consumes nextOffset and keeps opaque IDs intact", async () => {
  const event = saved.events[0],
    section = saved.sections.find(
      (s) => s.venueId === event.venueId && s.id === "101",
    )!;
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      calls.push(url);
      if (url.includes("/availability"))
        return Promise.resolve(
          Response.json({ sections: [{ id: "101", available: 201 }] }),
        );
      const offset = Number(
        new URL(url, "https://demo.invalid").searchParams.get("offset"),
      );
      return Promise.resolve(
        Response.json({
          seats: Array.from({ length: offset ? 1 : 200 }, (_, i) => ({
            id: `opaque-${offset + i}`,
            eventId: event.id,
            sectionId: "101",
            section: "101",
            row: Math.floor((offset + i) / 12) + 1,
            number: ((offset + i) % 12) + 1,
            tierId: "premium",
            priceCents: 15900,
            status: "available",
          })),
          nextOffset: offset ? null : 200,
        }),
      );
    }),
  );
  await loadSection(event.id, "101");
  expect(calls.some((c) => c.includes("offset=200"))).toBe(true);
  expect(getSectionInventory(event.id, section).seats).toHaveLength(201);
});
it("browser requests time out without retrying a mutation", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(
    (_url, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        options.signal!.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const pending = expect(
    request("/orders", { method: "POST" }),
  ).rejects.toThrow(/timed out/);
  await vi.advanceTimersByTimeAsync(12001);
  await pending;
  expect(fetch).toHaveBeenCalledTimes(1);
});
