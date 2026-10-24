import { z } from "zod";
export type * from "./catalog.js";
export type * from "./booking.js";
export const id = z.string().min(1).max(160);
export const credentials = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(72),
  })
  .strict();
export const registration = credentials.extend({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});
export const holdRequest = z
  .object({
    seatIds: z
      .array(id)
      .max(6)
      .refine((x) => new Set(x).size === x.length, "Duplicate seats"),
  })
  .strict();
export const quoteRequest = z
  .object({
    eventId: id,
    seatIds: z
      .array(id)
      .min(1)
      .max(6)
      .refine((x) => new Set(x).size === x.length),
    extras: z.record(id, z.number().int().min(0).max(6)).default({}),
    promo: z.string().trim().toUpperCase().max(40).default(""),
  })
  .strict();
export const orderRequest = quoteRequest.extend({
  attendee: z
    .object({
      fullName: z.string().trim().min(2).max(120),
      email: z.string().email().max(254),
      phone: z.string().min(7).max(30),
    })
    .strict(),
  deliveryMethod: z.enum(["mobile", "email"]),
  paymentOutcome: z.enum(["success", "failure"]).default("success"),
});
export const eventInput = z
  .object({
    id,
    artistId: id,
    venueId: id,
    name: z.string().min(1).max(160),
    tour: z.string().max(160),
    description: z.string().max(5000),
    startsAt: z.iso.datetime(),
    doorsAt: z.iso.datetime(),
    image: z.string().regex(/^\/images\/[a-z0-9-]+\.webp$/),
    imageMobile: z
      .string()
      .regex(/^\/images\/[a-z0-9-]+\.webp$/)
      .optional(),
    imageWidth: z.number().int().min(1).max(4096),
    imageHeight: z.number().int().min(1).max(4096),
    imageAlt: z.string().max(300),
    genre: z.string().max(80),
    tierIds: z
      .array(z.enum(["standard", "premium", "vip", "front-row"]))
      .min(1),
    status: z.enum(["DRAFT", "ON_SALE", "CANCELLED"]).default("DRAFT"),
  })
  .strict()
  .refine(
    (x) => Date.parse(x.doorsAt) <= Date.parse(x.startsAt),
    "Doors must open before the event",
  );
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "CUSTOMER" | "ADMIN";
}
