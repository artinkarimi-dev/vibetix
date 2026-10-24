import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "../database/client.js";
import type { Config } from "../config.js";
import type { AbuseProtection } from "../security/abuse.js";
import { requireAdminAssurance } from "../security/admin.js";
import { auditContext } from "../security/audit.js";
import { z } from "zod";
import {
  credentials,
  registration,
  holdRequest,
  quoteRequest,
  orderRequest,
  id,
  eventInput,
} from "../../../packages/shared/src/index.js";
import type { AuthUser } from "../../../packages/shared/src/index.js";
import {
  authenticate,
  register,
  login,
  sessionHash,
} from "../services/auth.js";
import { catalog, inventory } from "../services/catalog.js";
import {
  createOrder,
  holdSeats,
  quote,
  orderResponse,
  activeTicketIds,
} from "../services/booking.js";
import { fail } from "../utils/errors.js";
import { saveEvent, saveArtist, saveVenue } from "../services/admin.js";
declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}
const params = (req: FastifyRequest) => z.object({ id }).parse(req.params).id;
const user = (req: FastifyRequest) =>
  req.user ?? fail("UNAUTHORIZED", "Please sign in to continue.", 401);
const admin = (req: FastifyRequest) => {
  const value = user(req);
  if (value.role !== "ADMIN")
    fail("FORBIDDEN", "Administrator access required.", 403);
  return value;
};
export async function apiRoutes(
  app: FastifyInstance,
  db: Database,
  cfg: Config,
  abuse: AbuseProtection,
) {
  const cookie =
    cfg.NODE_ENV === "production" ? "__Host-vibetix" : "vibetix-session";
  app.decorateRequest("user", null);
  app.addHook("preHandler", async (req) => {
    req.user = await authenticate(db, req.cookies[cookie], cfg);
    await abuse.protect(req);
    if (req.routeOptions.url?.startsWith("/api/v1/admin/")) {
      admin(req);
      await requireAdminAssurance(db, cfg, req.cookies[cookie]);
    }
  });
  app.post("/auth/register", async (req, reply) => {
    await register(db, registration.parse(req.body));
    return reply.code(201).send({ ok: true });
  });
  app.post("/auth/login", async (req, reply) => {
    const body = credentials.parse(req.body);
    const result = await login(
      db,
      body.email,
      body.password,
      req.cookies[cookie],
      cfg,
    );
    reply.setCookie(cookie, result.token, {
      httpOnly: true,
      secure: cfg.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: result.expiresAt,
    });
    return { user: result.user };
  });
  app.get("/auth/me", async (req) => ({ user: req.user }));
  app.post("/auth/logout", async (req, reply) => {
    if (req.cookies[cookie])
      await db.session.deleteMany({
        where: { id: sessionHash(req.cookies[cookie]!) },
      });
    reply.clearCookie(cookie, {
      path: "/",
      secure: cfg.NODE_ENV === "production",
      sameSite: "strict",
      httpOnly: true,
    });
    return { ok: true };
  });
  app.get("/catalog", async () => catalog(db));
  app.get("/events", async (req) => {
    const query = z
      .object({
        q: z.string().max(100).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .parse(req.query);
    const all = (await catalog(db)).events;
    const filtered = query.q
      ? all.filter((e) =>
          `${e.name} ${e.genre}`.toLowerCase().includes(query.q!.toLowerCase()),
        )
      : all;
    return {
      events: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
    };
  });
  app.get("/events/:id", async (req) => {
    const eventId = params(req);
    const data = await catalog(db);
    const event = data.events.find((e) => e.id === eventId);
    if (!event) fail("NOT_FOUND", "Event not found.", 404);
    return {
      event,
      artist: data.artists.find((a) => a.id === event!.artistId),
      venue: data.venues.find((v) => v.id === event!.venueId),
    };
  });
  app.get("/artists", async () => ({ artists: (await catalog(db)).artists }));
  app.get("/venues", async () => ({ venues: (await catalog(db)).venues }));
  app.get("/events/:id/seats", async (req) => {
    const query = z
      .object({
        section: z.string().max(20).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .parse(req.query);
    const seats = await inventory(
      db,
      params(req),
      req.user?.id,
      query.section,
      query.limit,
      query.offset,
    );
    return {
      seats,
      nextOffset:
        seats.length === query.limit ? query.offset + query.limit : null,
    };
  });
  app.get("/events/:id/availability", async (req) => {
    if (
      !(await db.event.findFirst({
        where: { id: params(req), status: "ON_SALE" },
        select: { id: true },
      }))
    )
      fail("NOT_FOUND", "Event not found.", 404);
    const rows = await db.$queryRaw<
      { section: string; available: bigint }[]
    >`SELECT s.label AS section, count(*) FILTER (WHERE e.status='AVAILABLE' OR (e.status='HELD' AND (h."expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC') OR h."userId"=${req.user?.id ?? ""}))) AS available FROM "EventSeat" e JOIN "Seat" seat ON seat.id=e."seatId" JOIN "Section" s ON s.id=seat."sectionId" LEFT JOIN "SeatHold" h ON h."eventSeatId"=e.id WHERE e."eventId"=${params(req)} GROUP BY s.label`;
    return {
      sections: rows.map((r) => ({
        id: r.section,
        available: Number(r.available),
      })),
    };
  });
  app.post("/events/:id/hold-seats", async (req) =>
    holdSeats(
      db,
      cfg,
      user(req).id,
      params(req),
      holdRequest.parse(req.body).seatIds,
    ),
  );
  app.get("/holds", async (req) => {
    const holds = await db.seatHold.findMany({
      where: {
        userId: user(req).id,
        expiresAt: { gt: new Date() },
        eventSeat: { event: { status: "ON_SALE", date: { gt: new Date() } } },
      },
      include: {
        eventSeat: { include: { seat: { include: { section: true } } } },
      },
    });
    return {
      holds: holds.map((h) => ({
        seatId: h.eventSeatId,
        eventId: h.eventSeat.eventId,
        section: h.eventSeat.seat.section.label,
        expiresAt: h.expiresAt.toISOString(),
      })),
    };
  });
  app.post("/quotes", async (req) =>
    quote(db, user(req).id, quoteRequest.parse(req.body)),
  );
  app.post("/orders", async (req, reply) => {
    const key = z.string().uuid().parse(req.headers["idempotency-key"]);
    req.log.info({ event: "checkout_started" });
    const result = await createOrder(
      db,
      cfg,
      user(req).id,
      orderRequest.parse(req.body),
      key,
    );
    req.log.info({
      event: result.replayed
        ? "idempotent_replay"
        : result.failed
          ? "checkout_declined"
          : "checkout_confirmed",
    });
    if (result.failed)
      return reply.code(402).send({
        error: {
          code: "PAYMENT_DECLINED",
          message:
            "Simulated payment failed. Seats were released. Select them again before retrying.",
        },
        orderId: result.order.id,
      });
    return reply.code(201).send({ order: result.order });
  });
  const ownerOrders = async (req: FastifyRequest) => {
    const { cursor, limit } = z
      .object({
        cursor: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(100),
      })
      .parse(req.query);
    const userId = user(req).id;
    const anchor = cursor
      ? await db.order.findFirst({
          where: { id: cursor, userId, status: "CONFIRMED" },
          select: { id: true, createdAt: true },
        })
      : null;
    if (cursor && !anchor) fail("NOT_FOUND", "Order page not found.", 404);
    const rows = await db.order.findMany({
      where: {
        userId,
        status: "CONFIRMED",
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        event: { select: { status: true, date: true } },
        items: { include: { ticket: { select: { id: true, status: true } } } },
      },
    });
    const page = rows.slice(0, limit);
    return {
      orders: page.map((o) =>
        orderResponse(
          o.snapshot,
          cfg.TICKET_SIGNING_KEY,
          activeTicketIds(o),
          o.event,
        ),
      ),
      nextCursor: rows.length > limit ? page.at(-1)!.id : null,
    };
  };
  app.get("/orders", ownerOrders);
  app.get("/orders/:id", async (req) => {
    const order = await db.order.findFirst({
      where: { id: params(req), userId: user(req).id, status: "CONFIRMED" },
      include: {
        event: { select: { status: true, date: true } },
        items: { include: { ticket: { select: { id: true, status: true } } } },
      },
    });
    if (!order) return fail("NOT_FOUND", "Order not found.", 404);
    return {
      order: orderResponse(
        order.snapshot,
        cfg.TICKET_SIGNING_KEY,
        activeTicketIds(order),
        order.event,
      ),
    };
  });
  app.get("/tickets", async (req) => {
    const page = await ownerOrders(req);
    return {
      tickets: page.orders.flatMap((o) => o.tickets),
      nextCursor: page.nextCursor,
    };
  });
  app.get("/favorites", async (req) => ({
    favorites: (
      await db.favorite.findMany({ where: { userId: user(req).id } })
    ).map((x) => x.eventId),
  }));
  app.post("/favorites", async (req) => {
    const eventId = z.object({ eventId: id }).strict().parse(req.body).eventId;
    return db.favorite
      .upsert({
        where: { userId_eventId: { userId: user(req).id, eventId } },
        create: { userId: user(req).id, eventId },
        update: {},
      })
      .then(() => ({ ok: true }));
  });
  app.delete("/favorites/:id", async (req) => {
    await db.favorite.deleteMany({
      where: { userId: user(req).id, eventId: params(req) },
    });
    return { ok: true };
  });
  app.post("/admin/events", async (req, reply) => {
    admin(req);
    return reply.code(201).send({
      event: await saveEvent(
        db,
        eventInput.parse(req.body),
        false,
        auditContext(req, cfg),
      ),
    });
  });
  app.put("/admin/events/:id", async (req) => {
    admin(req);
    const body = eventInput.parse(req.body);
    if (body.id !== params(req))
      fail("ID_MISMATCH", "Event identifiers must agree.", 400);
    return { event: await saveEvent(db, body, true, auditContext(req, cfg)) };
  });
  app.put("/admin/artists/:id", async (req) => {
    admin(req);
    return {
      artist: await saveArtist(
        db,
        params(req),
        req.body,
        auditContext(req, cfg),
      ),
    };
  });
  app.put("/admin/venues/:id", async (req) => {
    admin(req);
    return {
      venue: await saveVenue(db, params(req), req.body, auditContext(req, cfg)),
    };
  });
  app.get("/admin/orders", async (req) => {
    admin(req);
    return {
      orders: await db.order.findMany({
        select: {
          id: true,
          eventId: true,
          status: true,
          total: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    };
  });
  app.get("/admin/events/:id/inventory", async (req) => {
    admin(req);
    return {
      inventory: await db.eventSeat.groupBy({
        by: ["status"],
        where: { eventId: params(req) },
        _count: true,
      }),
    };
  });
}
