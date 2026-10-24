import type { PricingTotals } from "../../types";
import { formatMoney } from "../../utils/pricing";
export function PricingBreakdown({
  totals,
  compact = false,
}: {
  totals: PricingTotals;
  compact?: boolean;
}) {
  return (
    <div className={`pricing-breakdown ${compact ? "compact" : ""}`}>
      <div>
        <span>Tickets</span>
        <span>{formatMoney(totals.ticketSubtotal)}</span>
      </div>
      {totals.extrasSubtotal > 0 && (
        <div>
          <span>Extras</span>
          <span>{formatMoney(totals.extrasSubtotal)}</span>
        </div>
      )}
      {totals.discount > 0 && (
        <div className="discount-line">
          <span>Promo discount</span>
          <span>−{formatMoney(totals.discount)}</span>
        </div>
      )}
      <div>
        <span>Service fee (8%)</span>
        <span>{formatMoney(totals.serviceFee)}</span>
      </div>
      <div>
        <span>Processing fee</span>
        <span>{formatMoney(totals.processingFee)}</span>
      </div>
      <div>
        <span>Illustrative tax (8.875%)</span>
        <span>{formatMoney(totals.tax)}</span>
      </div>
      <div className="grand-total">
        <strong>Total</strong>
        <strong data-testid="grand-total">
          {formatMoney(totals.grandTotal)}
        </strong>
      </div>
    </div>
  );
}
