import "server-only";
import { logRuntimeFailure } from "@/server/diagnostics/runtime";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import { HEARTBEAT, jobIds } from "./queue";
export async function workerHealthy(
  now = new Date(),
  availabilityOnly = false,
) {
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
    // This check also runs during Server Component rendering. Do not replay
    // expected degraded-health diagnostics into the browser error overlay.
    process.stderr.write(`worker_health_failed reason=${reason}\n`);
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
    if (availabilityOnly) return true;
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

// Deployment availability is independent of job backoff/completion. Strict callers
// (UI, diagnostic CLI) retain workerHealthy's original scheduling thresholds.
export const workerAvailable = (now = new Date()) => workerHealthy(now, true);
