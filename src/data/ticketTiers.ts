import type { TicketTier } from "../types";
export const ticketTiers: TicketTier[] = [
  {
    id: "standard",
    name: "Standard",
    price: 89,
    currency: "USD",
    description: "Be part of the moment.",
    features: [
      "Upper-level seating",
      "Full concert experience",
      "Digital mobile ticket",
    ],
    sectionIds: Array.from({ length: 20 }, (_, i) => String(201 + i)),
  },
  {
    id: "premium",
    name: "Premium",
    price: 159,
    currency: "USD",
    description: "A little closer to the magic.",
    features: [
      "Prime lower-level seating",
      "Excellent stage views",
      "Digital mobile ticket",
    ],
    popular: true,
    sectionIds: Array.from({ length: 20 }, (_, i) => String(101 + i)),
  },
  {
    id: "vip",
    name: "VIP",
    price: 299,
    currency: "USD",
    description: "Make your night extraordinary.",
    features: [
      "Exclusive floor access",
      "Priority venue entry",
      "Commemorative tour gift",
    ],
    sectionIds: ["B1", "B2", "B3"],
  },
  {
    id: "front-row",
    name: "Front Row",
    price: 499,
    currency: "USD",
    description: "As close as it gets.",
    features: [
      "Closest floor sections",
      "All VIP benefits included",
      "Exclusive tour merchandise",
    ],
    sectionIds: ["A1", "A2", "A3"],
  },
];
