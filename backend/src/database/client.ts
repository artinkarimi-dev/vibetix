import { PrismaClient } from "@prisma/client";
import type { Config } from "../config.js";
export const createDatabase = (cfg: Pick<Config, "DATABASE_URL">) => {
  const url = new URL(cfg.DATABASE_URL);
  for (const [key, fallback] of [
    ["connection_limit", "10"],
    ["connect_timeout", "5"],
    ["pool_timeout", "5"],
  ]) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, fallback);
    const value = url.searchParams.get(key)!;
    if (
      !/^\d+$/.test(value) ||
      Number(value) < 1 ||
      Number(value) > (key === "connection_limit" ? 50 : 30)
    )
      throw new Error("Invalid database pool/timeout configuration.");
  }
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
};
export type Database = PrismaClient;
