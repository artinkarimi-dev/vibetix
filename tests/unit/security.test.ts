import { afterEach, expect, it, vi } from "vitest";
import { safeReturnPath } from "../../src/utils/returnPath";
import {
  accountRevision,
  accountIsCurrent,
  invalidateAccount,
  notifyAccountChange,
  subscribeAccountChanges,
} from "../../src/api/authScope";
import { clearAccount, restoreAccount } from "../../src/api/session";
import { restoreSession, useAuth } from "../../src/api/authApi";
import { useOrderStore } from "../../src/store/orderStore";
import { useEventStore } from "../../src/store/eventStore";
import { useBookingStore } from "../../src/store/bookingStore";
import { createMockOrder } from "../../src/services/orders";
import { getSections, getSectionInventory } from "../../src/data/inventory";
import { events } from "../../src/data/events";
afterEach(() => {
  clearAccount();
  useAuth.setState({ user: null });
  vi.unstubAllGlobals();
});
it("rejects backslash, protocol-relative, control-character and absolute login redirects", () => {
  for (const value of [
    "/\\outside.invalid",
    "//outside.invalid",
    "https://outside.invalid",
    "/\t/outside.invalid",
    "/\n/outside.invalid",
    "/\\\\outside.invalid",
  ])
    expect(safeReturnPath(value)).toBe("/seats");
  expect(safeReturnPath("/seats?event=echoes-new-york#map")).toBe(
    "/seats?event=echoes-new-york#map",
  );
  expect(safeReturnPath("/%2Foutside.invalid")).toBe("/%2Foutside.invalid");
});
it("invalidates in-flight account scopes on account transitions", () => {
  const before = accountRevision();
  invalidateAccount();
  expect(accountIsCurrent(before)).toBe(false);
});
it("account broadcasts invalidate other documents without reloading their sender", () => {
  const channels: {
    onmessage?: (event: { data: unknown }) => void;
    close: () => void;
  }[] = [];
  vi.stubGlobal("window", {});
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage?: (event: { data: unknown }) => void;
      constructor() {
        channels.push(this);
      }
      postMessage(data: unknown) {
        for (const channel of channels)
          if (channel !== this) channel.onmessage?.({ data });
      }
      close() {}
    },
  );
  const changed = vi.fn();
  const close = subscribeAccountChanges(changed);
  notifyAccountChange();
  expect(changed).not.toHaveBeenCalled();
  channels[0].onmessage?.({
    data: { type: "changed", sourceId: "another-document" },
  });
  expect(changed).toHaveBeenCalledTimes(1);
  close();
});
it("late account restoration cannot repopulate private orders or favorites after logout", async () => {
  clearAccount();
  const event = events[0],
    section = getSections(event.venueId).find((s) => s.id === "101")!;
  const seat = getSectionInventory(event.id, section).seats[0];
  const order = createMockOrder(
    {
      eventId: event.id,
      viewingSection: section.id,
      selectedSeats: [seat.id],
      selectedExtras: {},
      attendee: null,
      deliveryMethod: "mobile",
      promoCode: "",
      seatHoldExpiresAt: Date.now() + 600000,
    },
    [seat],
    {
      fullName: "Private Account",
      email: "private@example.test",
      phone: "+1 212 555 0100",
    },
  );
  let resolve!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("/orders")
        ? new Promise<Response>((done) => {
            resolve = done;
          })
        : Promise.resolve(
            Response.json(
              url.endsWith("/favorites")
                ? { favorites: [event.id] }
                : { holds: [] },
            ),
          ),
    ),
  );
  const pending = restoreAccount();
  clearAccount();
  resolve(Response.json({ orders: [order] }));
  await pending;
  expect(useOrderStore.getState().orders).toEqual([]);
  expect(useEventStore.getState().favorites).toEqual([]);
  expect(useBookingStore.getState().selectedSeats).toEqual([]);
});
it("late auth/me responses cannot restore a signed-out user", async () => {
  let resolve!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const pending = restoreSession();
  invalidateAccount();
  useAuth.setState({ user: null });
  resolve(
    Response.json({
      user: {
        id: "old-account",
        firstName: "Old",
        lastName: "Account",
        email: "old@example.test",
        role: "CUSTOMER",
      },
    }),
  );
  await pending;
  expect(useAuth.getState().user).toBeNull();
});
