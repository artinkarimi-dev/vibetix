import { Link } from "react-router-dom";
import {
  CalendarDays,
  MapPin,
  Ticket,
  Sparkles,
  ArrowRight,
  Mail,
  Smartphone,
} from "lucide-react";
import { useBooking } from "../utils/useBooking";
import { useBookingStore } from "../store/bookingStore";
import { formatEventDate, formatEventTime } from "../utils/format";
import { formatMoney } from "../utils/pricing";
import { extras } from "../data/extras";
import { BookingSteps } from "../components/booking/BookingSteps";
import { BookingSummary } from "../components/booking/BookingSummary";
import { PromoForm } from "../components/booking/PromoForm";
export default function ReviewPage() {
  const { details, seats, selectedExtras } = useBooking();
  const delivery = useBookingStore((s) => s.deliveryMethod);
  if (!details) return null;
  const { event, artist, venue } = details;
  return (
    <div className="flow-page">
      <BookingSteps step={2} />
      <div className="flow-title">
        <div>
          <span className="eyebrow">THE DETAILS MAKE THE NIGHT</span>
          <h1>
            Your night, at a glance<span>.</span>
          </h1>
          <p>Everything looks good? Let’s make it official.</p>
        </div>
      </div>
      <div className="flow-grid">
        <div className="review-panels">
          <section className="panel review-event">
            <img
              src={artist.image}
              alt={event.imageAlt}
              width="640"
              height="426"
            />
            <div>
              <span className="eyebrow">{event.tour}</span>
              <h2>
                {artist.name} · {event.name}
              </h2>
              <p>
                <CalendarDays size={15} />
                {formatEventDate(event.startsAt, venue.timezone)} ·{" "}
                {formatEventTime(event.startsAt, venue.timezone)}
              </p>
              <p>
                <MapPin size={15} />
                {venue.name} · {venue.city}
              </p>
            </div>
          </section>
          <section className="panel review-section">
            <div className="review-section-heading">
              <h2>
                <Ticket size={18} />
                Your seats
              </h2>
              <Link to="/seats">
                Change Seats
                <ArrowRight size={13} />
              </Link>
            </div>
            <div className="review-ticket-list">
              {seats.map((seat) => (
                <div key={seat.id}>
                  <span>
                    <strong>Section {seat.section}</strong>
                    <small>
                      Row {seat.row} · Seat {seat.number}
                    </small>
                  </span>
                  <span>{seat.tierId.replace("-", " ")}</span>
                  <strong>{formatMoney(seat.priceCents)}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="panel review-section">
            <div className="review-section-heading">
              <h2>
                <Sparkles size={18} />
                Your extras
              </h2>
              <Link to="/extras">
                Change Extras
                <ArrowRight size={13} />
              </Link>
            </div>
            {extras.filter((e) => selectedExtras[e.id]).length ? (
              extras
                .filter((e) => selectedExtras[e.id])
                .map((extra) => (
                  <div className="review-extra-row" key={extra.id}>
                    <span>
                      {extra.name}
                      <small>
                        {selectedExtras[extra.id]} ×{" "}
                        {formatMoney(extra.priceCents)} / {extra.unit}
                      </small>
                    </span>
                    <strong>
                      {formatMoney(extra.priceCents * selectedExtras[extra.id])}
                    </strong>
                  </div>
                ))
            ) : (
              <p className="muted">Just the music. No extras added.</p>
            )}
          </section>
          <section className="panel review-section">
            <h2>
              {delivery === "mobile" ? (
                <Smartphone size={18} />
              ) : (
                <Mail size={18} />
              )}{" "}
              {delivery === "mobile" ? "Mobile Tickets" : "Email Tickets"}
            </h2>
            <p className="muted">
              You can change your delivery preference at checkout. This is a
              local simulation; no email is sent.
            </p>
            <PromoForm />
          </section>
        </div>
        <BookingSummary next="/checkout" label="Continue to Checkout" />
      </div>
    </div>
  );
}
