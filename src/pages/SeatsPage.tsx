import { FIXTURE_MODE } from "../api/client";
import { loadSection } from "../api/catalogApi";
import { useAuth } from "../api/authApi";
import { useEffect, useState } from "react";
import { useSearchParams, useLocation, Link } from "react-router-dom";
import { MapPin, Minus, Plus, RotateCcw, ChevronDown } from "lucide-react";
import { useBookingStore } from "../store/bookingStore";
import { useEventStore } from "../store/eventStore";
import { getEventDetails } from "../services/catalog";
import { getSections } from "../data/inventory";
import { defaultEventId } from "../data/events";
import { ArenaMap } from "../components/venue/ArenaMap";
import { SeatPicker } from "../components/venue/SeatPicker";
import { BookingSteps } from "../components/booking/BookingSteps";
import { BookingSummary } from "../components/booking/BookingSummary";
import { EmptyState } from "../components/common/EmptyState";
export default function SeatsPage() {
  const [params] = useSearchParams();
  const { state } = useLocation();
  const storedId = useBookingStore((s) => s.eventId);
  const eventId = params.get("event") ?? storedId ?? defaultEventId() ?? "";
  const viewingSection = useBookingStore((s) => s.viewingSection);
  const notice = useBookingStore((s) => s.notice);
  const viewSection = useBookingStore((s) => s.viewSection);
  const startEvent = useBookingStore((s) => s.startEvent);
  const clearNotice = useBookingStore((s) => s.clearNotice);
  const preferred = useEventStore((s) => s.selectedTiers[eventId] ?? "premium");
  const user = useAuth((s) => s.user);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState("");
  const [networkError, setNetworkError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (FIXTURE_MODE || !viewingSection) return;
    let active = true;
    setNetworkError("");
    const refresh = () =>
      loadSection(eventId, viewingSection)
        .then(() => {
          if (active) {
            setLoaded(`${eventId}:${viewingSection}`);
            setRevision((x) => x + 1);
          }
        })
        .catch((e) => {
          if (active) setNetworkError(e.message);
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [eventId, viewingSection, retry]);
  const [zoom, setZoom] = useState(1);
  const details = getEventDetails(eventId);
  useEffect(() => {
    if (getEventDetails(eventId)) startEvent(eventId, preferred);
  }, [eventId, preferred, startEvent]);
  if (!details)
    return (
      <EmptyState
        title="Event not found"
        description="This event is not in the lineup. Choose another show."
      />
    );
  const { event, artist, venue } = details;
  const sections = getSections(venue.id);
  const current = sections.find((s) => s.id === viewingSection);
  if (!sections.length)
    return (
      <EmptyState
        title="Seats are unavailable"
        description="No seat sections are configured for this fictional venue. Choose another demo event."
      />
    );
  return (
    <div className="flow-page">
      <BookingSteps step={0} />
      <div className="flow-title">
        <div>
          <Link className="back-link" to={`/events/${event.id}`}>
            ← Back to event
          </Link>
          <span className="eyebrow">
            {artist.name} · {event.name}
          </span>
          <h1>
            Find your place in the moment<span>.</span>
          </h1>
          <p>Choose a section. Explore the rows. Make the night yours.</p>
        </div>
        <span className="flow-meta">
          <MapPin size={14} />
          {venue.name}
        </span>
      </div>
      {(notice || (state as { message?: string } | null)?.message) && (
        <div className="inline-alert" role="alert">
          {notice ?? (state as { message?: string }).message}
          {notice && (
            <button aria-label="Dismiss booking notice" onClick={clearNotice}>
              ×
            </button>
          )}
        </div>
      )}
      {!FIXTURE_MODE && !user && (
        <p className="inline-alert">
          <Link
            to={`/account?next=${encodeURIComponent(`/seats?event=${eventId}`)}`}
          >
            Sign in to reserve seats
          </Link>
        </p>
      )}
      {networkError && (
        <div className="inline-alert" role="alert">
          {networkError}
          <button onClick={() => setRetry((x) => x + 1)}>
            Retry availability
          </button>
        </div>
      )}
      <div className="flow-grid">
        <div>
          <div className="panel interactive-map-panel">
            <div className="map-toolbar">
              <strong>Concert arena</strong>
              <div>
                <button
                  aria-label="Zoom out arena"
                  disabled={zoom <= 1}
                  onClick={() => setZoom(Math.max(1, zoom - 0.25))}
                >
                  <Minus size={16} />
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  aria-label="Zoom in arena"
                  disabled={zoom >= 1.75}
                  onClick={() => setZoom(Math.min(1.75, zoom + 0.25))}
                >
                  <Plus size={16} />
                </button>
                <button
                  aria-label="Reset arena zoom"
                  onClick={() => setZoom(1)}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            </div>
            <ArenaMap
              eventId={eventId}
              inventoryRevision={revision}
              venueId={venue.id}
              viewingSection={viewingSection}
              onView={viewSection}
              zoom={zoom}
            />
            <div className="section-select">
              <label htmlFor="section-select">
                Jump to a section
                <ChevronDown size={13} />
              </label>
              <select
                id="section-select"
                value={viewingSection ?? ""}
                onChange={(e) => viewSection(e.target.value)}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.tierId.replace("-", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!FIXTURE_MODE && loaded !== `${eventId}:${viewingSection}` && (
            <p role="status">Loading seat availability…</p>
          )}
          {current &&
            (FIXTURE_MODE || loaded === `${eventId}:${viewingSection}`) && (
              <SeatPicker
                key={`${eventId}:${current.id}`}
                eventId={eventId}
                section={current}
              />
            )}
        </div>
        <BookingSummary next="/extras" label="Continue to Extras" />
      </div>
      <div className="mobile-booking-bar">
        <Link className="button button-secondary" to="#booking-summary">
          View selection
        </Link>
        <MobileSeatsContinue />
      </div>
    </div>
  );
}
function MobileSeatsContinue() {
  const count = useBookingStore((s) => s.selectedSeats.length);
  return count ? (
    <Link className="button button-primary" to="/extras">
      Continue · {count} ticket{count > 1 ? "s" : ""}
    </Link>
  ) : (
    <span>Choose up to 6 seats</span>
  );
}
