import { Redis } from "ioredis";
import type { FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { privateKey, securityEvent } from "./events.js";
const increment = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('PTTL',KEYS[1])}`;
export class AbuseProtection {
  readonly redis?: Redis;
  private memory = new Map<string, { count: number; expires: number }>();
  constructor(private cfg: Config) {
    if (cfg.RATE_LIMIT_BACKEND === "redis") {
      if (!cfg.REDIS_URL) throw new Error("Redis URL required.");
      this.redis = new Redis(cfg.REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 1500,
        commandTimeout: 1500,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (times) => Math.min(times * 250, 2000),
      });
      this.redis.on("error", () => {

      });
    }
  }
  async start() {
    if (this.redis) {
      await this.redis.connect();
      await this.redis.ping();
    }
  }
  close() {
    this.redis?.disconnect();
    this.memory.clear();
  }
  async check(
    req: FastifyRequest,
    group: string,
    identity: string,
    max: number,
    windowMs = 60000,
  ) {
    const key = `vibetix:abuse:v1:${group}:${privateKey(this.cfg.ABUSE_KEY_SECRET, identity)}`;
    let count: number, ttl: number;
    try {
      if (this.redis) {
        [count, ttl] = (await this.redis.eval(increment, 1, key, windowMs)) as [
          number,
          number,
        ];
      } else {
        const now = Date.now();
        let entry = this.memory.get(key);
        if (!entry || entry.expires <= now) {
          if (this.memory.size >= 10000) {
            for (const [id, row] of this.memory)
              if (row.expires <= now) this.memory.delete(id);
            if (this.memory.size >= 10000)
              throw new Error("Counter capacity reached.");
          }
          entry = { count: 0, expires: now + windowMs };
          this.memory.set(key, entry);
        }
        count = ++entry.count;
        ttl = entry.expires - now;
      }
    } catch {
      securityEvent(req, this.cfg, "abuse_store_unavailable", group);
      throw new AppError(
        503,
        "ABUSE_PROTECTION_UNAVAILABLE",
        "Request protection is temporarily unavailable. Retry later.",
      );
    }
    if (count > max) {
      securityEvent(req, this.cfg, "rate_limited", group);
      const error = new AppError(
        429,
        "RATE_LIMITED",
        "Too many requests. Retry later.",
      );
      Object.assign(error, { retryAfter: Math.max(1, Math.ceil(ttl / 1000)) });
      throw error;
    }
  }
  async protect(req: FastifyRequest) {
    const route = req.routeOptions.url ?? "";
    if (
      req.method === "POST" &&
      /^\/api\/v1\/auth\/(login|register|password)/.test(route)
    ) {
      const operation = route.split("/").pop()!;
      const body = req.body as { email?: unknown } | null;
      if (typeof body?.email === "string")
        await this.check(
          req,
          `auth-${operation}-identity`,
          body.email.trim().toLowerCase().slice(0, 254),
          this.cfg.AUTH_IDENTITY_LIMIT,
          this.cfg.AUTH_WINDOW_MS,
        );
    }
    if (!req.user) return;
    if (req.method === "POST" && route.endsWith("/hold-seats"))
      await this.check(req, "holds", req.user.id, this.cfg.HOLD_RATE_LIMIT);
    if (req.method === "POST" && route === "/api/v1/orders")
      await this.check(
        req,
        "checkout",
        req.user.id,
        this.cfg.CHECKOUT_RATE_LIMIT,
      );
    if (req.method === "POST" && route === "/api/v1/quotes")
      await this.check(
        req,
        "quotes-promos",
        req.user.id,
        this.cfg.PROMO_RATE_LIMIT,
      );
  }
}
