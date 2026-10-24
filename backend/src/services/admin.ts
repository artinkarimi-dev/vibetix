import { Prisma } from "@prisma/client";
import { z } from "zod";
import { eventInput } from "../../../packages/shared/src/index.js";
import type { Database } from "../database/client.js";
import { lockEvent } from "./booking.js";
import { fail } from "../utils/errors.js";
import { recordAudit, type AuditContext } from "../security/audit.js";
export async function saveEvent(
  db: Database,
  input: z.infer<typeof eventInput>,
  edit: boolean,
  audit: AuditContext,
) {
  return db.$transaction(async (tx) => {
    if (edit) {
      await lockEvent(tx, input.id);
      const prior = await tx.event.findUniqueOrThrow({
        where: { id: input.id },
      });
      if (prior.venueId !== input.venueId)
        fail("VENUE_IMMUTABLE", "An existing event cannot move venues.");
    }
    const data = {
      artistId: input.artistId,
      venueId: input.venueId,
      title: input.name,
      description: input.description,
      date: new Date(input.startsAt),
      doorsOpen: new Date(input.doorsAt),
      status: input.status,
      presentation: input as unknown as Prisma.InputJsonValue,
    };
    const event = edit
      ? await tx.event.update({ where: { id: input.id }, data })
      : await tx.event.create({ data: { id: input.id, ...data } });
    if (!edit) {
      const seats = await tx.seat.findMany({
        where: { section: { venueId: input.venueId } },
        include: { section: true },
      });
      if (!seats.length)
        fail(
          "NO_VENUE_INVENTORY",
          "Configure venue sections and seats before creating an event.",
          400,
        );
      await tx.eventSeat.createMany({
        data: seats.map((s) => ({
          id: `${event.id}:${s.section.label}:${s.row}:${s.number}`,
          eventId: event.id,
          seatId: s.id,
          price:
            (
              {
                standard: 8900,
                premium: 15900,
                vip: 29900,
                "front-row": 49900,
              } as Record<string, number>
            )[s.section.tier] ?? 8900,
        })),
      });
    }
    await recordAudit(
      tx,
      audit,
      edit ? "EVENT_CHANGED" : "EVENT_CREATED",
      "Event",
      event.id,
    );
    return event;
  });
}
const image = z.string().regex(/^\/images\/[a-z0-9-]+\.webp$/);
const artistSchema = z
  .object({
    name: z.string().min(1).max(160),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(160),
    bio: z.string().max(5000),
    image,
    genre: z.string().max(80),
    imageAlt: z.string().max(300),
  })
  .strict();
export async function saveArtist(
  db: Database,
  id: string,
  body: unknown,
  audit: AuditContext,
) {
  const data = artistSchema.parse(body);
  return db.$transaction(async (tx) => {
    const artist = await tx.artist.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
    await recordAudit(tx, audit, "ARTIST_CHANGED", "Artist", id);
    return artist;
  });
}
const venueSchema = z
  .object({
    name: z.string().min(1).max(160),
    address: z.string().max(300),
    city: z.string().max(100),
    country: z.string().length(2),
    capacity: z.number().int().positive().max(1000000),
    timezone: z.string().refine((x) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: x });
        return true;
      } catch {
        return false;
      }
    }),
    image,
    description: z.string().max(5000),
  })
  .strict();
export async function saveVenue(
  db: Database,
  id: string,
  body: unknown,
  audit: AuditContext,
) {
  const data = venueSchema.parse(body);
  return db.$transaction(async (tx) => {
    const venue = await tx.venue.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
    await recordAudit(tx, audit, "VENUE_CHANGED", "Venue", id);
    return venue;
  });
}
