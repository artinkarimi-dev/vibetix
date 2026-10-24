import type { FastifyRequest } from "fastify";
import { createHmac } from "node:crypto";
import type { Config } from "../config.js";
export const privateKey = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("hex");
export type SecurityEvent =
  | "login_failed"
  | "rate_limited"
  | "abuse_store_unavailable"
  | "authorization_failed"
  | "booking_rejected"
  | "dependency_unavailable"
  | "origin_rejected";

export function securityEvent(
  req: FastifyRequest,
  cfg: Config,
  event: SecurityEvent,
  category?: string,
) {
  req.log.warn(
    {
      event,
      requestId: req.id,
      actorId: req.user?.id ?? null,
      peer: privateKey(cfg.ABUSE_KEY_SECRET, req.ip),
      route: req.routeOptions.url,
      ...(category ? { category } : {}),
    },
    "Security event",
  );
}
