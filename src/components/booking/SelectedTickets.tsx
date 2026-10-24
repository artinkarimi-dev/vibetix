import { Link } from "react-router-dom";
import { Ticket, ArrowRight, MapPin } from "lucide-react";
import type { Artist, Event, TicketTier, Venue } from "../../types";
import { formatEventDate } from "../../utils/format";
import { formatCurrency } from "../../utils/format";
export function SelectedTickets({
  event,
  artist,
  venue,
  tier,
}: {
  event: Event;
  artist: Artist;
  venue: Venue;
  tier: TicketTier;
}) {
  return (
    <aside className="selected-tickets">
      <div className="sidebar-heading">
        <Ticket size={18} />
        <h3>Your view of the night</h3>
      </div>
      <div className="sidebar-event">
        <span className="eyebrow">{event.tour}</span>
        <strong>
          {event.name} · {artist.name}
        </strong>
        <small>
          {formatEventDate(event.startsAt, venue.timezone)} · {venue.city}
        </small>
      </div>
      <div className="selection-empty">
        <span>
          <MapPin size={24} />
        </span>
        <strong>Get closer to the moment</strong>
        <p>
          Explore the arena, then choose
          <br />
          your exact row and seats.
        </p>
      </div>
      <div className="tier-summary">
        <span>Preferred ticket tier</span>
        <strong>
          {tier.name}
          <small>from {formatCurrency(tier.price)}</small>
        </strong>
      </div>
      <Link className="button button-primary" to={`/seats?event=${event.id}`}>
        Choose Your Seats
        <ArrowRight size={16} />
      </Link>
      <span className="checkout-note">
        Exact seat selection · Up to 6 tickets
      </span>
    </aside>
  );
}
