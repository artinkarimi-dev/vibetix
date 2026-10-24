import { useParams, Link } from "react-router-dom";
import { MapPin, Info, ArrowLeft } from "lucide-react";
import { defaultEventId } from "../data/events";
import { getEventDetails } from "../services/catalog";
import { useEventStore } from "../store/eventStore";
import { EventHero } from "../components/event/EventHero";
import { TicketTiers } from "../components/event/TicketTiers";
import { TrustPanel } from "../components/event/TrustPanel";
import { SeatMapPreview } from "../components/venue/SeatMapPreview";
import { SelectedTickets } from "../components/booking/SelectedTickets";
export function EventPage() {
  const { eventId = defaultEventId() } = useParams();
  const details = getEventDetails(eventId ?? "");
  const tierId = useEventStore(
    (state) => state.selectedTiers[eventId ?? ""] ?? "premium",
  );
  if (!details)
    return (
      <div className="unavailable-page">
        <span className="eyebrow">
          {eventId ? "EVENT NOT FOUND" : "DEMO LINEUP"}
        </span>
        <h1>
          {eventId
            ? "This show isn’t in our lineup."
            : "No shows are listed right now."}
        </h1>
        <p>Check the event link or explore the current lineup.</p>
        <Link className="button button-primary" to="/events">
          <ArrowLeft size={16} />
          Explore events
        </Link>
      </div>
    );
  const { event, artist, venue, tiers } = details;
  const selectedTier = tiers.find((tier) => tier.id === tierId) ?? tiers[0];
  return (
    <>
      <EventHero event={event} artist={artist} venue={venue} />
      <div className="page-content">
        <div className="ticket-layout">
          <TicketTiers tiers={tiers} eventId={event.id} />
          <TrustPanel />
        </div>
        <div className="seating-layout">
          <section
            className="seating-section"
            id="seats-preview"
            aria-labelledby="seats-title"
          >
            <div className="section-heading">
              <div>
                <span className="eyebrow">GET CLOSER TO THE MOMENT</span>
                <h2 id="seats-title">
                  Choose your seats<span>.</span>
                </h2>
              </div>
              <Link className="preview-tag" to={`/seats?event=${event.id}`}>
                OPEN SEAT MAP ↗
              </Link>
            </div>
            <div className="seat-map-panel">
              <div className="map-header">
                <span>
                  <MapPin size={14} />
                  {venue.name}
                </span>
                <span>{venue.city}</span>
              </div>
              <SeatMapPreview selectedTier={selectedTier.id} />
              <div className="map-notice">
                <Info size={14} />
                <span>Explore the arena, then choose your exact seats.</span>
              </div>
            </div>
          </section>
          <SelectedTickets
            event={event}
            artist={artist}
            venue={venue}
            tier={selectedTier}
          />
        </div>
        <div className="venue-note">
          <MapPin size={19} />
          <div>
            <strong>A legendary venue. An incredible night.</strong>
            <p>
              {venue.name} · {venue.address}
            </p>
          </div>
          <Link to={`/venues/${venue.id}`}>
            Venue details<span>↗</span>
          </Link>
        </div>
      </div>
    </>
  );
}
