import { extras } from "../data/extras";
import type { OrderExtra, PricingTotals, Seat } from "../types";
export const PRICING_POLICY = {
  serviceRate: 0.08,
  processingCents: 350,
  taxRate: 0.08875,
} as const;
export const PROMOS = {
  VIBETIX10: { kind: "percent", value: 10 },
  WELCOME15: { kind: "percent", value: 15 },
  ECHOES25: { kind: "fixed", value: 2500 },
} as const;

export function getPricedExtras(
  values: Readonly<Record<string, number>>,
  seatCount: number,
): OrderExtra[] {
  if (seatCount <= 0) return [];
  return extras.flatMap((extra) => {
    const quantity = Math.max(
      0,
      Math.min(
        extra.maxQuantity,
        extra.unit === "person" ? seatCount : extra.maxQuantity,
        Math.floor(Number.isFinite(values[extra.id]) ? values[extra.id] : 0),
      ),
    );
    return quantity > 0
      ? [
          {
            id: extra.id,
            name: extra.name,
            quantity,
            unitPriceCents: extra.priceCents,
          },
        ]
      : [];
  });
}
export function validatePromo(
  code: string,
  ticketSubtotal: number,
): { valid: boolean; code: string; message: string } {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { valid: true, code: "", message: "" };
  if (!Object.hasOwn(PROMOS, normalized))
    return {
      valid: false,
      code: normalized,
      message:
        "That promo code is not valid. Try VIBETIX10, WELCOME15, or ECHOES25.",
    };
  if (normalized === "ECHOES25" && ticketSubtotal < 10000)
    return {
      valid: false,
      code: normalized,
      message: "ECHOES25 requires at least $100 in tickets.",
    };
  return {
    valid: true,
    code: normalized,
    message:
      normalized === "ECHOES25"
        ? "$25 off tickets applied."
        : `${PROMOS[normalized as keyof typeof PROMOS].value}% off tickets applied.`,
  };
}
export function calculatePricing(
  seats: readonly Pick<Seat, "priceCents">[],
  selectedExtras: Readonly<Record<string, number>>,
  promoCode = "",
): PricingTotals {
  const ticketSubtotal = seats.reduce((sum, seat) => sum + seat.priceCents, 0);
  const extrasSubtotal = getPricedExtras(selectedExtras, seats.length).reduce(
    (sum, extra) => sum + extra.quantity * extra.unitPriceCents,
    0,
  );
  const promo = validatePromo(promoCode, ticketSubtotal);
  const definition =
    promo.valid && promo.code
      ? PROMOS[promo.code as keyof typeof PROMOS]
      : undefined;
  const discount = definition
    ? Math.min(
        ticketSubtotal,
        definition.kind === "percent"
          ? Math.round((ticketSubtotal * definition.value) / 100)
          : definition.value,
      )
    : 0;
  const serviceFee = seats.length
    ? Math.round((ticketSubtotal - discount) * PRICING_POLICY.serviceRate)
    : 0;
  const processingFee = seats.length ? PRICING_POLICY.processingCents : 0;
  const tax = seats.length
    ? Math.round(
        (ticketSubtotal -
          discount +
          extrasSubtotal +
          serviceFee +
          processingFee) *
          PRICING_POLICY.taxRate,
      )
    : 0;
  return {
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
  };
}
const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
export const formatMoney = (cents: number) =>
  moneyFormatter.format(cents / 100);
