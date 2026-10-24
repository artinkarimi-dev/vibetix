import Fastify, { LogController } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import { AbuseProtection } from "./security/abuse.js";
import { securityEvent } from "./security/events.js";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import type { Database } from "./database/client.js";
import type { Config } from "./config.js";
import { apiRoutes } from "./routes/api.js";
import { AppError } from "./utils/errors.js";
export async function buildApp(db: Database, cfg: Config, logging = true) {
  const app = Fastify({
    bodyLimit: 32768,
    logController: new LogController({ disableRequestLogging: true }),
    logger: logging
      ? {
          level: "info",
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            "res.headers.set-cookie",
          ],
          serializers: {
            req: (r) => ({ method: r.method, url: r.url?.split("?")[0] }),
          },
        }
      : false,
    trustProxy: cfg.TRUSTED_PROXY_CIDRS
      ? cfg.TRUSTED_PROXY_CIDRS.split(",").map((value) => value.trim())
      : false,
  });
  const abuse = new AbuseProtection(cfg);
  try {
    await abuse.start();
  } catch {
    abuse.close();
    throw new Error("Abuse protection failed to initialize.");
  }
  app.addHook("onClose", async () => abuse.close());

  app.addHook("onResponse", async (req, reply) => {
    req.log.info({
      event: "api_request",
      method: req.method,
      route: req.routeOptions.url ?? "__unmatched__",
      statusClass: `${Math.floor(reply.statusCode / 100)}xx`,
      status: reply.statusCode,
      durationMs: reply.elapsedTime,
    });
    if (req.method === "POST") {
      const route = req.routeOptions.url;
      if (route === "/api/v1/events/:id/hold-seats")
        req.log.info({
          event:
            reply.statusCode < 400
              ? "hold_updated"
              : reply.statusCode === 409
                ? "hold_conflict"
                : "hold_failed",
        });
      if (route === "/api/v1/events/:id/hold-seats" && reply.statusCode < 400) {
        const ids = (req.body as { seatIds?: unknown })?.seatIds;
        req.log.info({
          event:
            Array.isArray(ids) && ids.length ? "hold_created" : "hold_released",
        });
      }
      if (route === "/api/v1/orders" && reply.statusCode >= 400)
        req.log.info({
          event: "checkout_failed",
          statusClass: `${Math.floor(reply.statusCode / 100)}xx`,
        });
    }
  });
  await app.register(cookie);
  await app.register(helmet);
  await app.register(cors, { origin: cfg.APP_ORIGIN, credentials: true });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== cfg.APP_ORIGIN
    )
      throw new AppError(
        403,
        "ORIGIN_REJECTED",
        "Request origin is not allowed.",
      );
    if (!["/health", "/live", "/ready"].includes(req.routeOptions.url ?? "")) {
      await abuse.check(req, "global", req.ip, cfg.GLOBAL_RATE_LIMIT);
      const operation = /^\/api\/v1\/auth\/(login|register|password)/.exec(
        req.routeOptions.url ?? "",
      )?.[1];
      if (req.method === "POST" && operation)
        await abuse.check(
          req,
          `auth-${operation}-ip`,
          req.ip,
          cfg.AUTH_IP_LIMIT,
        );
    }
  });
  app.setErrorHandler((error, req, reply) => {
    let status = 500,
      code = "INTERNAL_ERROR",
      message = "The request could not be completed.";
    if (error instanceof AppError) {
      status = error.statusCode;
      code = error.code;
      message = error.message;
      if (status === 429 && "retryAfter" in error)
        reply.header("Retry-After", String(error.retryAfter));
    } else if (error instanceof ZodError) {
      status = 400;
      code = "VALIDATION_ERROR";
      message = "Invalid request. Check the submitted fields.";
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      status =
        error.code === "P2002"
          ? 409
          : error.code === "P2003" || error.code === "P2025"
            ? 400
            : 503;
      code = error.code === "P2002" ? "CONFLICT" : "DATABASE_ERROR";
      message =
        status === 409
          ? "This record or request already exists."
          : status === 400
            ? "A referenced record is invalid."
            : "The database request could not complete. Retry safely.";
    } else if (
      error instanceof Error &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      status = error.statusCode;
      code = "REQUEST_REJECTED";
      message = "The request was rejected.";
    }
    if (code === "INVALID_CREDENTIALS") securityEvent(req, cfg, "login_failed");
    if (code === "NOT_READY" || code === "DATABASE_ERROR")
      securityEvent(req, cfg, "dependency_unavailable", code);
    if (status === 401 || status === 403)
      securityEvent(
        req,
        cfg,
        code === "ORIGIN_REJECTED" ? "origin_rejected" : "authorization_failed",
      );
    if (
      [
        "SEAT_UNAVAILABLE",
        "HOLD_EXPIRED",
        "INVALID_SEATS",
        "IDEMPOTENCY_CONFLICT",
        "INVALID_PROMO",
        "INVALID_EXTRA",
      ].includes(code)
    )
      securityEvent(req, cfg, "booking_rejected", code);
    if (status >= 500)
      req.log.error(
        {
          requestId: req.id,
          errorType: error instanceof Error ? error.name : "UnknownError",
        },
        "Request failed",
      );
    reply.code(status).send({ error: { code, message }, requestId: req.id });
  });
  app.setNotFoundHandler((_, reply) =>
    reply
      .code(404)
      .send({ error: { code: "NOT_FOUND", message: "API route not found." } }),
  );
  app.get("/live", async () => ({ status: "ok" }));
  const readiness = async () => {
    try {
      await db.$queryRaw`SELECT 1`;
      if (abuse.redis) await abuse.redis.ping();
      return { status: "ok" };
    } catch {
      throw new AppError(
        503,
        "NOT_READY",
        "Service is temporarily unavailable.",
      );
    }
  };
  app.get("/ready", readiness);
  app.get("/health", readiness);
  await app.register(async (scoped) => apiRoutes(scoped, db, cfg, abuse), {
    prefix: "/api/v1",
  });
  return app;
}
