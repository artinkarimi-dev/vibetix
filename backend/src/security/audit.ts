import type { Prisma } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import { privateKey } from "./events.js";
export type AdminAction =
  | "EVENT_CREATED"
  | "EVENT_CHANGED"
  | "ARTIST_CHANGED"
  | "VENUE_CHANGED"
  | "TICKET_CHANGED"
  | "REFUND_REQUESTED"
  | "USER_ROLE_CHANGED";
export interface AuditContext {
  actorId: string;
  ip: string;
  userAgent: string;
}
export function auditContext(req: FastifyRequest, cfg: Config): AuditContext {
  return {
    actorId: req.user!.id,
    ip: privateKey(cfg.ABUSE_KEY_SECRET, req.ip),
    userAgent: privateKey(
      cfg.ABUSE_KEY_SECRET,
      String(req.headers["user-agent"] ?? ""),
    ),
  };
}

export async function recordAudit(
  tx: Prisma.TransactionClient,
  context: AuditContext,
  action: AdminAction,
  resource: string,
  resourceId: string,
) {

  await tx.auditLog.createMany({
    data: [
      { ...context, action, resource, resourceId, metadata: { version: 1 } },
    ],
  });
}
