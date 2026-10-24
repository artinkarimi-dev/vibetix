import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { Database } from "../database/client.js";
import type { AuthUser } from "../../../packages/shared/src/index.js";
import { fail } from "../utils/errors.js";
import { securityDefaults, type Config } from "../config.js";
export const sessionHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const publicUser = (user: AuthUser): AuthUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
});
export async function register(
  db: Database,
  input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  },
) {
  if (Buffer.byteLength(input.password) > 72)
    fail("PASSWORD_LENGTH", "Password must not exceed 72 UTF-8 bytes.", 400);
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    return publicUser(
      await db.user.create({
        data: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
        },
      }),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return null;
    throw error;
  }
}

const dummyHash = bcrypt.hashSync("not-a-user-password", 12);
export async function login(
  db: Database,
  email: string,
  password: string,
  previousToken?: string,
  cfg: Pick<Config, "ADMIN_SESSION_SECONDS"> = securityDefaults,
) {
  const user = await db.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  if (!valid || !user || Buffer.byteLength(password) > 72)
    return fail("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() +
      (user.role === "ADMIN" ? cfg.ADMIN_SESSION_SECONDS : 12 * 60 * 60) * 1000,
  );
  await db.$transaction(async (tx) => {
    await tx.session.create({
      data: { id: sessionHash(token), userId: user.id, expiresAt },
    });
    if (previousToken)
      await tx.session.deleteMany({
        where: { id: sessionHash(previousToken) },
      });
  });
  return { token, expiresAt, user: publicUser(user) };
}
export async function authenticate(
  db: Database,
  token: string | undefined,
  cfg = securityDefaults,
) {
  if (!token || token.length > 100) return null;
  const session = await db.session.findUnique({
    where: { id: sessionHash(token) },
    include: { user: true },
  });
  const now = new Date();
  if (!session || session.expiresAt <= now) return null;
  if (session.user.role === "ADMIN") {
    if (
      now.getTime() - session.createdAt.getTime() >=
        cfg.ADMIN_SESSION_SECONDS * 1000 ||
      now.getTime() - session.lastSeenAt.getTime() >=
        cfg.ADMIN_IDLE_SECONDS * 1000
    )
      return null;
    await db.session.updateMany({
      where: {
        id: session.id,
        lastSeenAt: { lt: new Date(now.getTime() - 30000) },
      },
      data: { lastSeenAt: now },
    });
  }
  return publicUser(session.user);
}
