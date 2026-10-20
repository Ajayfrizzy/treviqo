import "server-only";
import { logRuntimeFailure } from "@/server/diagnostics/runtime";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import { HEARTBEAT, jobIds } from "./queue";
export async function workerHealthy(now = new Date()) {
  let phase: "worker_redis" | "worker_database" = "worker_redis";
  const unhealthy = (
    reason:
      | "heartbeat_invalid"
      | "heartbeat_future"
      | "heartbeat_expired"
      | "jobs_missing"
      | "job_retries"
      | "job_overdue"
      | "job_stale"
      | "job_never_completed",
  ) => {
    console.error(`worker_health_failed reason=${reason}`);
    return false;
  };
  try {
    const heartbeat = Number(await getRedis().get(HEARTBEAT));
    if (!Number.isFinite(heartbeat)) return unhealthy("heartbeat_invalid");
    if (heartbeat > now.getTime() + 5000) return unhealthy("heartbeat_future");
    if (now.getTime() - heartbeat > 45000)
      return unhealthy("heartbeat_expired");
    phase = "worker_database";
    const jobs = await getDb().backgroundJob.findMany({
      where: { id: { in: [...jobIds] } },
    });
    if (jobs.length !== jobIds.length) return unhealthy("jobs_missing");
    for (const job of jobs) {
      if (!(job.attempts < 5)) return unhealthy("job_retries");
      if (!(job.dueAt.getTime() > now.getTime() - 300000))
        return unhealthy("job_overdue");
      if (job.lastSucceededAt) {
        if (!(now.getTime() - job.lastSucceededAt.getTime() < 7200000))
          return unhealthy("job_stale");
      } else if (!(now.getTime() - job.createdAt.getTime() < 120000))
        return unhealthy("job_never_completed");
    }
    return true;
  } catch (error) {
    logRuntimeFailure(phase, error);
    throw error;
  }
}
