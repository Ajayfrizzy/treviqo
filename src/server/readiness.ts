import "server-only";
import { getEnv } from "@/server/config/env";
import { workerHealthy } from "@/server/jobs/health";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import { getObjectStorage } from "@/server/storage/client";
import { authConfigured } from "@/modules/auth/options";
async function bounded(check: () => Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(check),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function isReady() {
  const checks = await Promise.allSettled([
    bounded(async () => {
      await getDb().user.findFirst({ select: { id: true } });
      await getDb().reminder.findFirst({ select: { id: true } });
      await getDb().backgroundJob.findFirst({ select: { id: true } });
    }),
    bounded(async () => {
      await getRedis().ping();
    }),
    bounded(async () => {
      await getObjectStorage().checkConnection();
    }),
    bounded(async () => {
      const env = getEnv();
      if (
        (env.WORKER_REQUIRED ??
          (env.NODE_ENV === "production" ? "true" : "false")) === "true" &&
        !(await workerHealthy())
      )
        throw new Error("Worker unavailable");
    }),
    bounded(async () => {
      if (!authConfigured()) throw new Error("Auth unavailable");
    }),
  ]);
  return checks.every((check) => check.status === "fulfilled");
}
