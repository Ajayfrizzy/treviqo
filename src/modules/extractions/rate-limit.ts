import "server-only";
import { getRedis } from "@/server/redis/client";
export async function allowExtraction(userId: string) {
  const count = await getRedis().eval(
    `local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 600) end; return n`,
    1,
    `treviqo:extraction:${userId}`,
  );
  return Number(count) <= 10;
}
