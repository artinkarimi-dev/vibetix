import { useParams, Link } from "react-router-dom";
import { artists } from "../data/artists";
import { venues } from "../data/venues";
import { events } from "../data/events";
import { EventCard } from "../components/event/EventCard";
import { EmptyState } from "../components/common/EmptyState";
export default function DetailPage() {
  const { artistId, venueId } = useParams();
  const artist = artists.find((a) => a.id === artistId);
  const venue = venues.find((v) => v.id === venueId);
  if (!artist && !venue)
    return (
      <EmptyState
        title={artistId ? "Artist not found" : "Venue not found"}
        description="This page isn’t in the catalog. Explore the lineup to find your next show."
      />
    );
  const name = artist?.name ?? venue!.name;
  const matching = events.filter((e) =>
    artist ? e.artistId === artist.id : e.venueId === venue!.id,
  );
  return (
    <div className="discovery-page">
      <Link className="back-link" to={artist ? "/artists" : "/venues"}>
        ← All {artist ? "artists" : "venues"}
      </Link>
      <div className="detail-hero panel">
        <img
          src={artist?.image ?? venue!.image}
          alt={artist?.imageAlt ?? `Illustrative view of ${name}`}
          width={artist ? 640 : 768}
          height={artist ? 426 : 512}
        />
        <div>
          <span className="eyebrow">{artist?.genre ?? venue!.city}</span>
          <h1>
            {name}
            <span>.</span>
          </h1>
          <p>{artist?.bio ?? venue!.description}</p>
          {venue && (
            <>
              <p>{venue.address}</p>
              <span className="subtle-badge">
                {venue.capacity.toLocaleString("en-US")} capacity
              </span>
              <p className="caption">
                Venue photographs and seat layouts are fictional illustrations,
                not official venue representations.
              </p>
            </>
          )}
        </div>
      </div>
      <h2 className="catalog-section-title">
        Upcoming shows<span>.</span>
      </h2>
      <div className="catalog-grid">
        {matching.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
