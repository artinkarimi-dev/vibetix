import type { Venue } from "../types";
export const venues: Venue[] = [
  {
    id: "madison-square-garden",
    name: "Madison Square Garden",
    city: "New York, NY",
    address: "4 Pennsylvania Plaza, New York, NY 10001",
    capacity: 20789,
    timezone: "America/New_York",
    image: "/images/venue-garden.webp",
    description:
      "An iconic arena in the heart of Manhattan. Our seating experience is an illustrative concert configuration, not an official venue plan.",
  },
  {
    id: "harbor-pavilion",
    name: "Harbor Pavilion",
    city: "Boston, MA",
    address: "100 Seaport Boulevard, Boston, MA",
    capacity: 8500,
    timezone: "America/New_York",
    image: "/images/venue-harbor.webp",
    description:
      "A fictional waterfront music destination with sweeping stage views and a skyline backdrop.",
  },
  {
    id: "violet-arena",
    name: "Violet Arena",
    city: "Chicago, IL",
    address: "200 Lakeshore Drive, Chicago, IL",
    capacity: 16000,
    timezone: "America/Chicago",
    image: "/images/venue-garden.webp",
    description:
      "A fictional indoor arena designed for larger-than-life live performances.",
  },
  {
    id: "northstar-hall",
    name: "Northstar Hall",
    city: "Seattle, WA",
    address: "300 Aurora Avenue, Seattle, WA",
    capacity: 6000,
    timezone: "America/Los_Angeles",
    image: "/images/venue-northstar.webp",
    description:
      "A fictional music hall with an intimate atmosphere and a spectacular concert sound.",
  },
];
