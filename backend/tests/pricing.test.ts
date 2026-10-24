import { test } from "node:test";
import assert from "node:assert/strict";
import { priceOrder } from "../src/services/pricing.js";
const now = new Date("2026-10-14T00:00:00Z");
test("server pricing uses integer cents, promo and per-person boundaries", () => {
  const promo = {
    id: "p",
    code: "VIBETIX10",
    type: "PERCENT" as const,
    value: 10,
    minimum: 0,
    expiresAt: new Date("2028-01-01"),
    active: true,
  };
  const extra = {
    id: "lounge",
    name: "Lounge",
    price: 6500,
    unit: "person",
    maxQuantity: 6,
    presentation: {},
  };
  const result = priceOrder(
    [15900, 15900],
    { lounge: 1 },
    [extra],
    promo,
    promo.code,
    now,
  );
  assert.equal(result.totals.grandTotal, 41111);
  assert.equal(result.totals.discount, 3180);
  assert.throws(() =>
    priceOrder([15900], { lounge: 2 }, [extra], null, "", now),
  );
  assert.throws(() =>
    priceOrder([15900], {}, [], { ...promo, expiresAt: now }, promo.code, now),
  );
  assert.throws(() =>
    priceOrder([8900], {}, [], { ...promo, minimum: 10000 }, promo.code, now),
  );
  assert.throws(() => priceOrder([], {}, [], null, "", now));
});
