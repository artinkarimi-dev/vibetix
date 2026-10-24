import { artists } from "../data/artists";
import { events } from "../data/events";
import { ticketTiers } from "../data/ticketTiers";
import { venues } from "../data/venues";

export function getEventDetails(id: string) {
  const event = events.find((item) => item.id === id);
  if (!event) return undefined;
  const artist = artists.find((item) => item.id === event.artistId);
  const venue = venues.find((item) => item.id === event.venueId);
  if (!artist || !venue) return undefined;
  return {
    event,
    artist,
    venue,
    tiers: ticketTiers.filter((tier) => event.tierIds.includes(tier.id)),
  };
}
