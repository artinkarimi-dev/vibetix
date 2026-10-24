import { Link } from "react-router-dom";
import { Heart, MapPin, CalendarDays, ArrowUpRight } from "lucide-react";
import type { Event } from "../../types";
import { getEventDetails } from "../../services/catalog";
import { useEventStore } from "../../store/eventStore";
import { formatMoney } from "../../utils/pricing";
import { formatEventDate } from "../../utils/format";
export function EventCard({ event }: { event: Event }) {
  const details = getEventDetails(event.id)!;
  const favorite = useEventStore((s) => s.favorites.includes(event.id));
  const toggle = useEventStore((s) => s.toggleFavorite);
  return (
    <article className="event-card panel">
      <div className="event-card-image">
        <Link to={`/events/${event.id}`} tabIndex={-1} aria-hidden="true">
          <img
            src={details.artist.image}
            alt=""
            width="640"
            height="426"
            loading="lazy"
            decoding="async"
          />
        </Link>
        <span>{event.genre}</span>
        <button
          className={`icon-button ${favorite ? "is-favorite" : ""}`}
          aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${details.artist.name} ${event.name} ${details.venue.city}`}
          aria-pressed={favorite}
          onClick={() => toggle(event.id)}
        >
          <Heart size={18} fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="event-card-copy">
        <span className="eyebrow">{event.tour}</span>
        <Link to={`/events/${event.id}`}>
          <h2>{details.artist.name}</h2>
          <h3>{event.name}</h3>
        </Link>
        <p>
          <CalendarDays size={13} />
          {formatEventDate(event.startsAt, details.venue.timezone)}
        </p>
        <p>
          <MapPin size={13} />
          {details.venue.name} · {details.venue.city}
        </p>
        <div>
          <span>
            From{" "}
            <strong>
              {formatMoney(
                Math.min(...details.tiers.map((t) => t.price)) * 100,
              )}
            </strong>
          </span>
          <Link className="text-link" to={`/events/${event.id}`}>
            Get Tickets
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}
