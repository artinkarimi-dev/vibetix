import { events } from "../data/events";
import { artists } from "../data/artists";
import { venues } from "../data/venues";
export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: "Event" | "Artist" | "Venue";
  path: string;
  searchText: string;
}
const buildSearchIndex = (): SearchResult[] => [
  ...events.map((event) => {
    const artist = artists.find((a) => a.id === event.artistId)!;
    const venue = venues.find((v) => v.id === event.venueId)!;
    return {
      id: `event-${event.id}`,
      title: `${artist.name} · ${event.name}`,
      subtitle: `${venue.name} · ${venue.city}`,
      type: "Event" as const,
      path: `/events/${event.id}`,
      searchText:
        `${event.name} ${event.tour} ${artist.name} ${venue.name} ${venue.city} ${event.genre}`.toLowerCase(),
    };
  }),
  ...artists.map((artist) => ({
    id: `artist-${artist.id}`,
    title: artist.name,
    subtitle: artist.genre,
    type: "Artist" as const,
    path: `/artists/${artist.id}`,
    searchText: `${artist.name} ${artist.genre}`.toLowerCase(),
  })),
  ...venues.map((venue) => ({
    id: `venue-${venue.id}`,
    title: venue.name,
    subtitle: venue.city,
    type: "Venue" as const,
    path: `/venues/${venue.id}`,
    searchText: `${venue.name} ${venue.city}`.toLowerCase(),
  })),
];
export const searchIndex = buildSearchIndex();
export const rebuildSearchIndex = () => {
  searchIndex.splice(0, searchIndex.length, ...buildSearchIndex());
};

export function searchCatalog(query: string) {
  const words = query.trim().toLowerCase().split(/\s+/);
  return searchIndex
    .filter((entry) => words.every((word) => entry.searchText.includes(word)))
    .slice(0, 8);
}
