import { z } from "zod";
import { isIP } from "node:net";
import { readFileSync, statSync } from "node:fs";
const positive = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
const securitySchema = z.object({
  APP_MODE: z.enum(["commercial", "portfolio"]).default("commercial"),
  RATE_LIMIT_BACKEND: z.enum(["memory", "redis"]).default("memory"),
  REDIS_URL: z.string().url().optional(),
  ABUSE_KEY_SECRET: z
    .string()
    .min(32)
    .default("development-only-abuse-key-not-for-production"),
  GLOBAL_RATE_LIMIT: positive(600),
  AUTH_IP_LIMIT: positive(10),
  AUTH_IDENTITY_LIMIT: positive(20),
  AUTH_WINDOW_MS: positive(900000),
  HOLD_RATE_LIMIT: positive(30),
  CHECKOUT_RATE_LIMIT: positive(10),
  PROMO_RATE_LIMIT: positive(30),
  ADMIN_SESSION_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(3600),
  ADMIN_IDLE_SECONDS: z.coerce.number().int().min(30).max(900).default(900),
  ADMIN_MFA_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(900)
    .default(300),
  TRUSTED_PROXY_CIDRS: z
    .string()
    .default("")
    .refine(
      (value) =>
        value === "" ||
        value.split(",").every((part) => {
          const [address, prefix, extra] = part.trim().split("/");
          const version = isIP(address);
          return (
            version !== 0 &&
            extra === undefined &&
            (prefix === undefined ||
              (/^\d+$/.test(prefix) &&
                Number(prefix) > 0 &&
                Number(prefix) <= (version === 4 ? 32 : 128)))
          );
        }),
      "Use explicit IP addresses or CIDRs; never a boolean or a hop count.",
    ),
});
export const securityDefaults = securitySchema.parse({});
const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    TICKET_SIGNING_KEY: z.string().min(32),
    DATABASE_URL: z.string().url(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().default("127.0.0.1"),
    APP_ORIGIN: z
      .string()
      .url()
      .refine(
        (value) => new URL(value).origin === value,
        "Use an origin without a path or trailing slash.",
      )
      .default("http://localhost:5173"),
    HOLD_SECONDS: z.coerce.number().int().min(5).max(900).default(600),
    ALLOW_SIMULATED_PAYMENTS: z.enum(["true", "false"]).default("false"),
    EMAIL_TRANSPORT: z.enum(["disabled", "local"]).default("disabled"),
  })
  .extend(securitySchema.shape)
  .superRefine((value, context) => {
    if (value.RATE_LIMIT_BACKEND === "redis" && !value.REDIS_URL)
      context.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "Redis URL required.",
      });
    if (
      value.REDIS_URL &&
      (!URL.canParse(value.REDIS_URL) ||
        !["redis:", "rediss:"].includes(new URL(value.REDIS_URL).protocol))
    )
      context.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "Invalid Redis protocol.",
      });
    if (value.APP_MODE === "portfolio") {
      const database = URL.canParse(value.DATABASE_URL)
        ? new URL(value.DATABASE_URL)
        : null;
      if (
        !database ||
        !/^[a-z0-9_]+_demo(?:_test)?$/.test(database.pathname.slice(1))
      )
        context.addIssue({
          code: "custom",
          path: ["DATABASE_URL"],
          message: "Portfolio mode requires a dedicated *_demo database.",
        });
    }
    if (value.NODE_ENV === "production") {
      if (
        value.REDIS_URL &&
        URL.canParse(value.REDIS_URL) &&
        (!new URL(value.REDIS_URL).username ||
          !new URL(value.REDIS_URL).password)
      )
        context.addIssue({
          code: "custom",
          path: ["REDIS_URL"],
          message: "Production Redis requires explicit ACL credentials.",
        });
      const database = URL.canParse(value.DATABASE_URL)
        ? new URL(value.DATABASE_URL)
        : null;
      if (
        database?.searchParams.get("sslmode") !== "require" ||
        database.searchParams.get("sslaccept") !== "strict"
      )
        context.addIssue({
          code: "custom",
          path: ["DATABASE_URL"],
          message: "Verified database TLS is required.",
        });
      if (
        value.RATE_LIMIT_BACKEND !== "redis" ||
        !value.REDIS_URL?.startsWith("rediss://")
      )
        context.addIssue({
          code: "custom",
          path: ["REDIS_URL"],
          message: "Shared TLS Redis is required.",
        });
      if (
        value.ABUSE_KEY_SECRET.startsWith("development-") ||
        value.ABUSE_KEY_SECRET.startsWith("REPLACE_") ||
        value.ABUSE_KEY_SECRET === value.TICKET_SIGNING_KEY
      )
        context.addIssue({
          code: "custom",
          path: ["ABUSE_KEY_SECRET"],
          message: "Provide an independent random abuse key.",
        });
    }
    if (
      value.NODE_ENV === "production" &&
      value.ALLOW_SIMULATED_PAYMENTS === "true"
    )
      context.addIssue({
        code: "custom",
        path: ["ALLOW_SIMULATED_PAYMENTS"],
        message: "Simulated payments are prohibited in production.",
      });
    if (
      value.NODE_ENV === "production" &&
      !value.APP_ORIGIN.startsWith("https://")
    )
      context.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "Production requires HTTPS.",
      });
    if (value.NODE_ENV === "production" && value.EMAIL_TRANSPORT === "local")
      context.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message: "Local email capture cannot be used in production.",
      });
    if (value.TICKET_SIGNING_KEY.startsWith("REPLACE_"))
      context.addIssue({
        code: "custom",
        path: ["TICKET_SIGNING_KEY"],
        message: "Provide a random signing key.",
      });
  });
export type Config = z.infer<typeof schema>;
export function loadConfig() {
  const env = { ...process.env };
  for (const name of [
    "DATABASE_URL",
    "REDIS_URL",
    "TICKET_SIGNING_KEY",
    "ABUSE_KEY_SECRET",
  ]) {
    const file = env[`${name}_FILE`];
    if (!file) continue;
    if (env[name]) throw new Error(`Ambiguous configuration field: ${name}.`);
    try {
      if (statSync(file).size > 65536) throw new Error();
      env[name] = readFileSync(file, "utf8").trim();
    } catch {
      throw new Error(`Cannot load configuration field: ${name}.`);
    }
  }
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid configuration fields: ${[...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`,
    );
  return result.data;
}
