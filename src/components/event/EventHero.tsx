import {
  CalendarDays,
  Clock3,
  MapPin,
  ArrowUpRight,
  Play,
  Heart,
  Check,
  Radio,
} from "lucide-react";
import type { Artist, Event, Venue } from "../../types";
import { Link } from "react-router-dom";
import {
  formatEventDate,
  formatEventTime,
  formatEventDay,
  formatEventYear,
} from "../../utils/format";
import { EventCountdown } from "./EventCountdown";
import { useEventStore } from "../../store/eventStore";
export function EventHero({
  event,
  artist,
  venue,
}: {
  event: Event;
  artist: Artist;
  venue: Venue;
}) {
  const favorite = useEventStore((state) => state.favorites.includes(event.id));
  const toggleFavorite = useEventStore((state) => state.toggleFavorite);
  return (
    <section className="event-hero" aria-labelledby="event-title">
      <picture className="hero-picture">
        {event.imageMobile && (
          <source
            media="(max-width: 600px)"
            srcSet={event.imageMobile}
            width={768}
            height={960}
          />
        )}
        <img
          width={event.imageWidth}
          height={event.imageHeight}
          className="hero-image"
          src={event.image}
          alt={event.imageAlt}
          fetchPriority="high"
        />
      </picture>
      <div className="hero-shade" />
      <div className="hero-inner">
        <div className="hero-breadcrumb">
          <Link to="/events">Events</Link>
          <span>/</span>
          <span>{artist.name}</span>
          <span>/</span>
          <span>
            {event.name} {event.tour}
          </span>
        </div>
        <div className="hero-copy">
          <div className="tour-badge">
            <Radio size={12} />
            {event.tour}
            <span>{formatEventYear(event.startsAt, venue.timezone)}</span>
          </div>
          <p className="artist-name">{artist.name}</p>
          <h1 id="event-title">{event.name}</h1>
          <p className="live-label">
            <span />
            LIVE IN CONCERT
            <span />
          </p>
          <p className="hero-description">{event.description}</p>
          <div className="event-meta">
            <div>
              <CalendarDays size={18} />
              <span>
                <strong>
                  {formatEventDate(event.startsAt, venue.timezone)}
                </strong>
                <small>
                  {formatEventDay(event.startsAt, venue.timezone)} ·{" "}
                  {formatEventTime(event.startsAt, venue.timezone)}
                  <span className="meta-dot">·</span>Doors{" "}
                  {formatEventTime(event.doorsAt, venue.timezone)}
                </small>
              </span>
            </div>
            <div>
              <MapPin size={19} />
              <span>
                <strong>{venue.name}</strong>
                <small>{venue.city}</small>
              </span>
            </div>
          </div>
          <EventCountdown date={event.startsAt} />
          <div className="hero-actions">
            <a className="button button-primary hero-cta" href="#tickets">
              Get Tickets Now
              <ArrowUpRight size={18} />
            </a>
            {event.previewUrl ? (
              <a
                className="preview-button"
                href={event.previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <Play size={12} fill="currentColor" />
                </span>
                Watch Tour Preview
              </a>
            ) : (
              <button
                className="preview-button"
                disabled
                title="Official tour preview has not been supplied"
              >
                <span>
                  <Play size={12} fill="currentColor" />
                </span>
                <span className="preview-label">
                  Watch Tour Preview<small>Coming soon</small>
                </span>
              </button>
            )}
          </div>
        </div>
        <button
          className={`hero-favorite icon-button ${favorite ? "is-favorite" : ""}`}
          aria-label={
            favorite ? "Remove event from favorites" : "Save event to favorites"
          }
          aria-pressed={favorite}
          onClick={() => toggleFavorite(event.id)}
        >
          <Heart size={19} fill={favorite ? "currentColor" : "none"} />
        </button>
        <div className="hero-caption">
          <span className="caption-line" />
          <span>
            FEEL EVERY NOTE.
            <br />
            <strong>LIVE EVERY MOMENT.</strong>
          </span>
        </div>
        <div className="hero-bottom">
          <span>
            <Check size={13} />
            An unforgettable night starts here.
          </span>
          <span>
            <Clock3 size={13} />
            One unforgettable night in {venue.city.split(",")[0]}
          </span>
        </div>
      </div>
    </section>
  );
}
