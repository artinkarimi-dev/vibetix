import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, MapPin } from "lucide-react";
import { artists } from "../data/artists";
import { venues } from "../data/venues";
import { events } from "../data/events";
import { searchIndex } from "../services/search";
import { EventCard } from "../components/event/EventCard";
import { useEventStore } from "../store/eventStore";
import { EmptyState } from "../components/common/EmptyState";
export default function DiscoveryPage({
  kind = "events",
}: {
  kind?: "events" | "artists" | "venues" | "favorites";
}) {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [genre, setGenre] = useState("All");
  const favorites = useEventStore((s) => s.favorites);
  const matchingEvents = events.filter(
    (event) =>
      (kind !== "favorites" || favorites.includes(event.id)) &&
      (genre === "All" || event.genre === genre) &&
      searchIndex
        .find((item) => item.id === `event-${event.id}`)
        ?.searchText.includes(query.toLowerCase()),
  );
  if (kind === "favorites" && !favorites.length)
    return (
      <EmptyState
        title="Save a show. Start a story."
        description="Tap the heart on an event to keep it here. Sign in to save favorites to your demo account."
      />
    );
  return (
    <div className="discovery-page">
      <div className="discovery-heading">
        <span className="eyebrow">
          {kind === "events"
            ? "YOUR NEXT UNFORGETTABLE NIGHT"
            : kind === "artists"
              ? "THE PEOPLE BEHIND THE MOMENTS"
              : kind === "venues"
                ? "THE PLACES THAT BRING US TOGETHER"
                : "YOUR PERSONAL LINEUP"}
        </span>
        <h1>
          {kind === "events"
            ? "Live starts here"
            : kind === "artists"
              ? "Meet the artists"
              : kind === "venues"
                ? "Discover the venues"
                : "Your favorites"}
          <span>.</span>
        </h1>
        <p>
          {kind === "events"
            ? "Find your sound. Feel the energy. Be there."
            : kind === "artists"
              ? "New favorites and voices you already love."
              : kind === "venues"
                ? "Iconic stages and extraordinary spaces."
                : "The shows you’re thinking about, all in one place."}
        </p>
      </div>
      {kind === "events" || kind === "favorites" ? (
        <>
          <div className="catalog-filters">
            <label className="catalog-search">
              Find a show
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search event, artist, venue, city"
                maxLength={100}
              />
            </label>
            <div className="genre-filters" aria-label="Filter by genre">
              {["All", "Pop", "Soul", "Rock", "Electronic"].map((value) => (
                <button
                  className={genre === value ? "active" : ""}
                  key={value}
                  aria-pressed={genre === value}
                  onClick={() => setGenre(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <span className="catalog-count">
            {matchingEvents.length} upcoming show
            {matchingEvents.length === 1 ? "" : "s"}
          </span>
          {matchingEvents.length ? (
            <div className="catalog-grid">
              {matchingEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="catalog-empty">
              <h2>No shows match those filters.</h2>
              <button
                className="button button-secondary"
                onClick={() => {
                  setQuery("");
                  setGenre("All");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="catalog-grid">
          {kind === "artists"
            ? artists.map((artist) => (
                <article className="discovery-card panel" key={artist.id}>
                  <Link to={`/artists/${artist.id}`}>
                    <img
                      src={artist.image}
                      alt={artist.imageAlt}
                      width="640"
                      height="426"
                      loading="lazy"
                    />
                    <div>
                      <span className="eyebrow">{artist.genre}</span>
                      <h2>{artist.name}</h2>
                      <p>
                        {
                          events.filter((event) => event.artistId === artist.id)
                            .length
                        }{" "}
                        upcoming shows
                      </p>
                      <span className="text-link">
                        Discover artist
                        <ArrowUpRight size={15} />
                      </span>
                    </div>
                  </Link>
                </article>
              ))
            : venues.map((venue) => (
                <article className="discovery-card panel" key={venue.id}>
                  <Link to={`/venues/${venue.id}`}>
                    <img
                      src={venue.image}
                      alt={`Illustrative concert venue for ${venue.name}`}
                      width="768"
                      height="512"
                      loading="lazy"
                    />
                    <div>
                      <span className="eyebrow">
                        <MapPin size={11} />
                        {venue.city}
                      </span>
                      <h2>{venue.name}</h2>
                      <p>
                        {venue.capacity.toLocaleString("en-US")} capacity ·{" "}
                        {
                          events.filter((event) => event.venueId === venue.id)
                            .length
                        }{" "}
                        shows
                      </p>
                      <span className="text-link">
                        Explore venue
                        <ArrowUpRight size={15} />
                      </span>
                    </div>
                  </Link>
                </article>
              ))}
        </div>
      )}
    </div>
  );
}
