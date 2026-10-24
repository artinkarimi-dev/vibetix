import type { Extra, PromoCode } from "@prisma/client";
import type {
  PricingTotals,
  OrderExtra,
} from "../../../packages/shared/src/index.js";
import { fail } from "../utils/errors.js";
export function priceOrder(
  prices: number[],
  selections: Record<string, number>,
  catalog: Extra[],
  promo: PromoCode | null,
  code: string,
  now: Date,
): { totals: PricingTotals; extras: OrderExtra[] } {
  if (
    !prices.length ||
    prices.length > 6 ||
    prices.some((p) => !Number.isSafeInteger(p) || p < 0)
  )
    fail("INVALID_SEATS", "Choose one to six seats.", 400);
  const extras = Object.entries(selections)
    .filter(([, n]) => n > 0)
    .map(([id, quantity]) => {
      const extra = catalog.find((x) => x.id === id);
      if (
        !extra ||
        !Number.isInteger(quantity) ||
        quantity < 0 ||
        quantity > extra.maxQuantity ||
        (extra.unit === "person" && quantity > prices.length)
      )
        return fail("INVALID_EXTRA", "An extra quantity is invalid.", 400);
      return { id, name: extra.name, quantity, unitPriceCents: extra.price };
    });
  if (code && (!promo || !promo.active || promo.expiresAt <= now))
    fail("INVALID_PROMO", "This promo is invalid or expired.", 400);
  const ticketSubtotal = prices.reduce((s, n) => s + n, 0);
  if (promo && ticketSubtotal < promo.minimum)
    fail(
      "PROMO_MINIMUM",
      "This promo's minimum ticket subtotal has not been met.",
      400,
    );
  const discount = promo
    ? Math.min(
        ticketSubtotal,
        promo.type === "PERCENT"
          ? Math.round((ticketSubtotal * promo.value) / 100)
          : promo.value,
      )
    : 0;
  const extrasSubtotal = extras.reduce(
    (s, e) => s + e.quantity * e.unitPriceCents,
    0,
  );
  const serviceFee = Math.round((ticketSubtotal - discount) * 0.08),
    processingFee = 350;
  const tax = Math.round(
    (ticketSubtotal - discount + extrasSubtotal + serviceFee + processingFee) *
      0.08875,
  );
  return {
    extras,
    totals: {
      ticketSubtotal,
      extrasSubtotal,
      discount,
      serviceFee,
      processingFee,
      tax,
      grandTotal:
        ticketSubtotal +
        extrasSubtotal -
        discount +
        serviceFee +
        processingFee +
        tax,
      currency: "USD",
    },
  };
}
