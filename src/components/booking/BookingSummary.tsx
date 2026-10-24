import { FIXTURE_MODE } from "../../api/client";
import { Link } from "react-router-dom";
import { Ticket, X, ArrowRight, ShieldCheck } from "lucide-react";
import { useBookingStore } from "../../store/bookingStore";
import { useBooking } from "../../utils/useBooking";
import { formatEventDate } from "../../utils/format";
import { formatMoney } from "../../utils/pricing";
import { PricingBreakdown } from "./PricingBreakdown";
import { HoldTimer } from "./HoldTimer";
export function BookingSummary({
  next,
  label = "Continue",
  showPrices = true,
}: {
  next?: string;
  label?: string;
  showPrices?: boolean;
}) {
  const { details, seats, totals, quoteError, authoritative } = useBooking();
  const removeSeat = useBookingStore((s) => s.removeSeat);
  if (!details) return null;
  const { event, artist, venue } = details;
  return (
    <aside
      id="booking-summary"
      className="booking-summary panel"
      aria-label="Booking summary"
    >
      <div className="summary-header">
        <Ticket size={19} />
        <h2>Your tickets</h2>
        <span>{seats.length}/6</span>
      </div>
      <div className="summary-event">
        <span className="eyebrow">{event.tour}</span>
        <h3>
          {artist.name} · {event.name}
        </h3>
        <p>
          {formatEventDate(event.startsAt, venue.timezone)}
          <br />
          {venue.name} · {venue.city}
        </p>
      </div>
      <HoldTimer />
      {!authoritative && seats.length > 0 && (
        <p role="status">Updating server quote…</p>
      )}
      {quoteError && (
        <p className="inline-alert" role="alert">
          {quoteError}
        </p>
      )}
      <div className="summary-seats" aria-live="polite">
        {seats.length ? (
          seats.map((seat) => (
            <div className="summary-seat" key={seat.id}>
              <span>
                <strong>Section {seat.section}</strong>
                <small>
                  Row {seat.row} · Seat {seat.number}
                </small>
              </span>
              <strong>{formatMoney(seat.priceCents)}</strong>
              <button
                aria-label={`Remove section ${seat.section} row ${seat.row} seat ${seat.number}`}
                onClick={() => removeSeat(seat.id)}
              >
                <X size={15} />
              </button>
            </div>
          ))
        ) : (
          <p className="summary-empty">
            Select a section, then choose your exact seats. Your tickets will
            appear here.
          </p>
        )}
      </div>
      {showPrices && <PricingBreakdown totals={totals} compact />}
      {next &&
        (seats.length ? (
          <Link className="button button-primary summary-continue" to={next}>
            {label}
            <ArrowRight size={17} />
          </Link>
        ) : (
          <button className="button button-primary summary-continue" disabled>
            {label}
            <ArrowRight size={17} />
          </button>
        ))}
      <p className="simulation-note">
        <ShieldCheck size={13} />
        {FIXTURE_MODE
          ? "Frontend simulation · No real reservation"
          : "Server-held inventory · Payments simulated"}
      </p>
    </aside>
  );
}
