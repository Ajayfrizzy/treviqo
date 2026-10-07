import "server-only";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import { HEARTBEAT, jobIds } from "./queue";
export async function workerHealthy(now = new Date()) {
  const heartbeat = Number(await getRedis().get(HEARTBEAT));
  if (
    !Number.isFinite(heartbeat) ||
    heartbeat > now.getTime() + 5000 ||
    now.getTime() - heartbeat > 45000
  )
    return false;
  const jobs = await getDb().backgroundJob.findMany({
    where: { id: { in: [...jobIds] } },
  });
  return (
    jobs.length === jobIds.length &&
    jobs.every(
      (job) =>
        job.attempts < 5 &&
        job.dueAt.getTime() > now.getTime() - 300000 &&
        (job.lastSucceededAt
          ? now.getTime() - job.lastSucceededAt.getTime() < 7200000
          : now.getTime() - job.createdAt.getTime() < 120000),
    )
  );
}
