import "server-only";
import { PrismaClient } from "@prisma/client";
import { getEnv } from "@/server/config/env";
const shared = globalThis as unknown as { prisma?: PrismaClient };
export function getDb() {
  const url = getEnv().DATABASE_URL;
  if (!url) throw new Error("Database is not configured");
  return shared.prisma ??= new PrismaClient({ datasources: { db: { url: String(url) } }, log: [] });
}
