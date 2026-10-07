import "server-only";
import type Redis from "ioredis";
export const QUEUE = "treviqo:jobs:due";
export const HEARTBEAT = "treviqo:worker:heartbeat";
export const jobIds = [
  "reminders",
  "session_cleanup",
  "account_cleanup",
] as const;
export type JobId = (typeof jobIds)[number];
export const validJob = (id: string): id is JobId =>
  (jobIds as readonly string[]).includes(id);
export const retryDelay = (attempt: number) =>
  Math.min(1800000, 10000 * 2 ** Math.min(attempt, 8));
export async function popDue(
  redis: Redis,
  now: number,
): Promise<string | null> {
  const value = await redis.eval(
    `local v=redis.call('ZRANGEBYSCORE',KEYS[1],'-inf',ARGV[1],'LIMIT',0,1); if #v==0 then return false end; redis.call('ZREM',KEYS[1],v[1]); return v[1]`,
    1,
    QUEUE,
    now,
  );
  return typeof value === "string" ? value : null;
}
