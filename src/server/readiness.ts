import "server-only";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import { getObjectStorage } from "@/server/storage/client";
import { authConfigured } from "@/modules/auth/options";
async function bounded(check: () => Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.resolve().then(check), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 3000); })]);
  } finally { clearTimeout(timer); }
}
export async function isReady() {
  const checks = await Promise.allSettled([
    bounded(async () => { await getDb().user.findFirst({ select: { id: true } }); }),
    bounded(async () => { await getRedis().ping(); }),
    bounded(async () => { await getObjectStorage().checkConnection(); }),
    bounded(async () => { if (!authConfigured()) throw new Error("Auth unavailable"); }),
  ]);
  return checks.every(check => check.status === "fulfilled");
}
