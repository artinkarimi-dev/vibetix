import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { artists } from "../../src/data/artists.ts";
import { venues } from "../../src/data/venues.ts";
import { events } from "../../src/data/events.ts";
import { extras } from "../../src/data/extras.ts";
import { venueSections } from "../../src/data/inventory.ts";
import { ticketTiers } from "../../src/data/ticketTiers.ts";
const db = new PrismaClient();
try {
  if (process.env.APP_MODE === "portfolio") {
    const name = decodeURIComponent(
      new URL(process.env.DATABASE_URL!).pathname.slice(1),
    );
    if (
      !/^[a-z0-9_]+_demo(?:_test)?$/.test(name) ||
      process.env.ADMIN_EMAIL ||
      process.env.ADMIN_PASSWORD
    )
      throw new Error(
        "Portfolio seed requires a dedicated *_demo database and no admin bootstrap.",
      );
  }
  for (const artist of artists)
    await db.artist.upsert({
      where: { id: artist.id },
      create: { ...artist, slug: artist.id },
      update: {},
    });
  for (const venue of venues)
    await db.venue.upsert({
      where: { id: venue.id },
      create: { ...venue, country: "US" },
      update: {},
    });
  for (const section of venueSections) {
    const id = `${section.venueId}:${section.id}`;
    await db.section.upsert({
      where: { id },
      create: {
        id,
        venueId: section.venueId,
        label: section.id,
        name: section.name,
        tier: section.tierId,
        level: section.level,
        position: section.index,
        capacity: 96,
      },
      update: {},
    });
    await db.seat.createMany({
      data: Array.from({ length: 96 }, (_, i) => ({
        id: `${id}:${Math.floor(i / 12) + 1}:${(i % 12) + 1}`,
        sectionId: id,
        row: Math.floor(i / 12) + 1,
        number: (i % 12) + 1,
      })),
      skipDuplicates: true,
    });
  }
  const all = [
    ...events,
    {
      ...events[events.length - 1],
      id: "noah-midnight-encore",
      name: "Midnight Encore",
      startsAt: "2027-09-18T00:00:00.000Z",
      doorsAt: "2027-09-17T22:30:00.000Z",
    },
  ];
  for (const [index, original] of all.entries()) {
    const now = new Date();
    const demoStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 30 + index * 14,
        20,
      ),
    );
    const event =
      process.env.APP_MODE === "portfolio"
        ? {
            ...original,
            startsAt: demoStart.toISOString(),
            doorsAt: new Date(demoStart.getTime() - 7200000).toISOString(),
          }
        : original;
    await db.event.upsert({
      where: { id: event.id },
      create: {
        id: event.id,
        artistId: event.artistId,
        venueId: event.venueId,
        title: event.name,
        description: event.description,
        date: new Date(event.startsAt),
        doorsOpen: new Date(event.doorsAt),
        status: "ON_SALE",
        presentation: event as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
    const seats = await db.seat.findMany({
      where: { section: { venueId: event.venueId } },
      include: { section: true },
    });
    for (let start = 0; start < seats.length; start += 1000)
      await db.eventSeat.createMany({
        data: seats.slice(start, start + 1000).map((s) => ({
          id: `${event.id}:${s.section.label}:${s.row}:${s.number}`,
          eventId: event.id,
          seatId: s.id,
          price: Math.round(
            (ticketTiers.find((t) => t.id === s.section.tier)?.price ?? 89) *
              100,
          ),
        })),
        skipDuplicates: true,
      });
  }
  for (const extra of extras)
    await db.extra.upsert({
      where: { id: extra.id },
      create: {
        id: extra.id,
        name: extra.name,
        price: extra.priceCents,
        unit: extra.unit,
        maxQuantity: extra.maxQuantity,
        presentation: extra as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
  for (const [code, type, value, minimum] of [
    ["VIBETIX10", "PERCENT", 10, 0],
    ["WELCOME15", "PERCENT", 15, 0],
    ["ECHOES25", "FIXED", 2500, 10000],
  ] as const)
    await db.promoCode.upsert({
      where: { code },
      create: {
        code,
        type,
        value,
        minimum,
        expiresAt: new Date("2028-01-01T00:00:00Z"),
      },
      update: {},
    });
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (
      Buffer.byteLength(process.env.ADMIN_PASSWORD) < 12 ||
      Buffer.byteLength(process.env.ADMIN_PASSWORD) > 72
    )
      throw new Error("Admin password must be 12–72 UTF-8 bytes.");
    await db.user.upsert({
      where: { email: process.env.ADMIN_EMAIL.toLowerCase() },
      create: {
        email: process.env.ADMIN_EMAIL.toLowerCase(),
        passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12),
        firstName: "Site",
        lastName: "Administrator",
        role: "ADMIN",
      },
      update: {},
    });
  }
  console.info(
    JSON.stringify({
      events: await db.event.count(),
      seats: await db.seat.count(),
      eventSeats: await db.eventSeat.count(),
    }),
  );
} finally {
  await db.$disconnect();
}
