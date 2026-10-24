import type { Database } from "../database/client.js";
import type { Config } from "../config.js";
import { authenticate, sessionHash } from "../services/auth.js";
import { fail } from "../utils/errors.js";
export interface AdminMfaVerifier {

  verify(
    proof: unknown,
    context: { userId: string; sessionId: string },
  ): Promise<boolean>;
}
export async function requireAdminAssurance(
  db: Database,
  cfg: Config,
  token: string | undefined,
) {
  if (cfg.NODE_ENV !== "production") return;
  if (!token) fail("UNAUTHORIZED", "Please sign in to continue.", 401);
  const session = await db.session.findUnique({
    where: { id: sessionHash(token!) },
  });
  const now = Date.now();
  if (
    !session ||
    session.expiresAt.getTime() <= now ||
    !session.mfaVerifiedAt ||
    session.mfaVerifiedAt.getTime() > now ||
    now - session.mfaVerifiedAt.getTime() > cfg.ADMIN_MFA_MAX_AGE_SECONDS * 1000
  )
    fail(
      "ADMIN_MFA_REQUIRED",
      "Administrative access requires recent verified MFA.",
      403,
    );
}

export async function completeAdminStepUp(
  db: Database,
  cfg: Config,
  token: string,
  proof: unknown,
  verifier: AdminMfaVerifier,
) {
  const user = await authenticate(db, token, cfg);
  if (user?.role !== "ADMIN")
    fail("UNAUTHORIZED", "Please sign in to continue.", 401);
  const session = await db.session.findUnique({
    where: { id: sessionHash(token) },
    include: { user: true },
  });
  if (
    !session ||
    session.user.role !== "ADMIN" ||
    session.expiresAt <= new Date()
  )
    fail("UNAUTHORIZED", "Please sign in to continue.", 401);
  if (
    !(await verifier.verify(proof, {
      userId: session!.userId,
      sessionId: session!.id,
    }))
  )
    fail(
      "ADMIN_MFA_REQUIRED",
      "Administrative access requires verified MFA.",
      403,
    );
  const updated = await db.session.updateMany({
    where: {
      id: session!.id,
      expiresAt: { gt: new Date() },
      createdAt: {
        gt: new Date(Date.now() - cfg.ADMIN_SESSION_SECONDS * 1000),
      },
      lastSeenAt: { gt: new Date(Date.now() - cfg.ADMIN_IDLE_SECONDS * 1000) },
      user: { role: "ADMIN" },
    },
    data: { mfaVerifiedAt: new Date() },
  });
  if (!updated.count) fail("UNAUTHORIZED", "Please sign in to continue.", 401);
}
