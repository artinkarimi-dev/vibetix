import { useBooking } from "../utils/useBooking";
import { extras } from "../data/extras";
import { useBookingStore } from "../store/bookingStore";
import { formatMoney } from "../utils/pricing";
import { BookingSteps } from "../components/booking/BookingSteps";
import { BookingSummary } from "../components/booking/BookingSummary";
import { Minus, Plus, Check } from "lucide-react";
export default function ExtrasPage() {
  const { seats, selectedExtras } = useBooking();
  const setExtra = useBookingStore((s) => s.setExtra);
  return (
    <div className="flow-page">
      <BookingSteps step={1} />
      <div className="flow-title">
        <div>
          <span className="eyebrow">MAKE IT A NIGHT TO REMEMBER</span>
          <h1>
            A little extra. A lot more unforgettable<span>.</span>
          </h1>
          <p>Make the experience yours. Every add-on is optional.</p>
        </div>
        <span className="subtle-badge">
          {seats.length} ticket{seats.length > 1 ? "s" : ""} selected
        </span>
      </div>
      <div className="flow-grid">
        <div className="extras-grid">
          {extras.map((extra) => {
            const quantity = selectedExtras[extra.id] ?? 0;
            const max =
              extra.unit === "person"
                ? Math.min(seats.length, extra.maxQuantity)
                : extra.maxQuantity;
            return (
              <article
                className={`extra-card panel ${quantity ? "added" : ""}`}
                key={extra.id}
              >
                <img
                  src={extra.image}
                  alt={extra.imageAlt}
                  width={extra.imageWidth}
                  height={extra.imageHeight}
                  loading="lazy"
                  decoding="async"
                />
                <div className="extra-content">
                  <span className="eyebrow">
                    {extra.unit === "person"
                      ? "PER PERSON"
                      : extra.unit === "vehicle"
                        ? "PER VEHICLE"
                        : "PER PACKAGE"}
                  </span>
                  <h2>{extra.name}</h2>
                  <p>{extra.description}</p>
                  <div className="extra-bottom">
                    <strong>
                      {formatMoney(extra.priceCents)}
                      <small> / {extra.unit}</small>
                    </strong>
                    {quantity ? (
                      <div className="quantity-control">
                        <button
                          aria-label={`Remove one ${extra.name}`}
                          onClick={() => setExtra(extra.id, quantity - 1)}
                        >
                          <Minus size={15} />
                        </button>
                        <span aria-live="polite">{quantity}</span>
                        <button
                          aria-label={`Add one ${extra.name}`}
                          disabled={quantity >= max}
                          onClick={() => setExtra(extra.id, quantity + 1)}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="button button-secondary"
                        onClick={() => setExtra(extra.id, 1)}
                      >
                        Add
                        <Plus size={15} />
                      </button>
                    )}
                  </div>
                  {quantity > 0 && (
                    <span className="extra-added">
                      <Check size={12} />
                      Added to your night
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <BookingSummary next="/review" label="Review Booking" />
      </div>
    </div>
  );
}
