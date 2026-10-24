export type TierId = "standard" | "premium" | "vip" | "front-row";
export interface Artist {
  id: string;
  name: string;
  genre: string;
  bio: string;
  image: string;
  imageAlt: string;
}
export interface Venue {
  id: string;
  name: string;
  city: string;
  address: string;
  capacity: number;
  timezone: string;
  image: string;
  description: string;
}
export interface TicketTier {
  id: TierId;
  name: string;
  price: number;
  currency: "USD";
  description: string;
  features: string[];
  popular?: boolean;
  sectionIds: string[];
}
export interface Event {
  id: string;
  artistId: string;
  venueId: string;
  name: string;
  tour: string;
  description: string;
  startsAt: string;
  doorsAt: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
  imageAlt: string;
  tierIds: TierId[];
  genre: string;
  imageMobile?: string;
  previewUrl?: string;
}
export interface VenueSection {
  id: string;
  venueId: string;
  name: string;
  tierId: TierId;
  level: "floor" | "lower" | "upper";
  index: number;
}
export interface SeatRow {
  id: string;
  sectionId: string;
  number: number;
  seatIds: string[];
}
export type SeatStatus = "available" | "selected" | "unavailable";
export interface Seat {
  id: string;
  eventId: string;
  sectionId: string;
  section: string;
  row: number;
  number: number;
  tierId: TierId;
  priceCents: number;
  status: SeatStatus;
}
export interface Extra {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: "USD";
  unit: "person" | "vehicle" | "package";
  maxQuantity: number;
  image: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
}
