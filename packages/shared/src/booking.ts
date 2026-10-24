import type { Seat } from "./catalog.js";
export interface Attendee {
  fullName: string;
  email: string;
  phone: string;
}
export type DeliveryMethod = "mobile" | "email";
export interface PricingTotals {
  ticketSubtotal: number;
  extrasSubtotal: number;
  discount: number;
  serviceFee: number;
  processingFee: number;
  tax: number;
  grandTotal: number;
  currency: "USD";
}
export interface Booking {
  eventId: string | null;
  viewingSection: string | null;
  selectedSeats: string[];
  selectedExtras: Record<string, number>;
  attendee: Attendee | null;
  deliveryMethod: DeliveryMethod;
  promoCode: string;
  seatHoldExpiresAt: number | null;
}
export interface OrderExtra {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}
export interface DigitalTicket {
  id: string;
  orderId: string;
  eventId: string;
  event: string;
  artist: string;
  venue: string;
  city: string;
  date: string;
  timezone: string;
  section: string;
  row: number;
  seat: number;
  ticketId: string;
  qrValue: string;
  status: "valid";
  priceCents: number;
}
export interface Order {
  id: string;
  orderNumber: string;
  eventId: string;
  eventName: string;
  artist: string;
  venue: string;
  city: string;
  address: string;
  startsAt: string;
  timezone: string;
  attendee: Attendee;
  tickets: DigitalTicket[];
  seats: Seat[];
  extras: OrderExtra[];
  deliveryMethod: DeliveryMethod;
  promo: string | null;
  totals: PricingTotals;
  purchaseDate: string;
  status: "confirmed";
  simulation: true;
  ticketNotice?: string;
  currentStartsAt?: string;
}
