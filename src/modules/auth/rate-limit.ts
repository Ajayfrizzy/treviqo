import "server-only";
import { createHmac } from "node:crypto";
import { getRedis } from "@/server/redis/client";
import { getEnv } from "@/server/config/env";
async function allow(key: string, limit: number, seconds: number) {
  const count = await getRedis().eval(
    `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
    return count
  `,
    1,
    key,
    seconds,
  );
  return Number(count) <= limit;
}
// Keep the existing global circuit-breaker; do not trust arbitrary forwarding headers.
export const allowAuthRequest = () => allow("treviqo:auth:requests", 300, 60);
export function allowCredentialAttempt(email: string) {
  const secret = getEnv().SESSION_SECRET;
  if (!secret) throw new Error("Authentication is not configured");
  const key = createHmac("sha256", secret).update(email).digest("hex");
  return allow(`treviqo:auth:account:${key}`, 10, 15 * 60);
}
