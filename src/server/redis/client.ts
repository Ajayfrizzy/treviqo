import "server-only";
import Redis from "ioredis";
import { getEnv } from "@/server/config/env";
let client: Redis | undefined;
export function getRedis() {
  const url = getEnv().REDIS_URL;
  if (!url) throw new Error("Redis is not configured");
  if (!client || client.status === "end") {
    client = new Redis(String(url), {
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2500,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    client.on("error", () => {
      /* Callers handle failures; do not log connection credentials. */
    });
  }
  return client;
}
