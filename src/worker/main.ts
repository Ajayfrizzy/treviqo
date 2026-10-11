import { jobRunner } from "@/server/jobs/runner";
import { workerHealthy } from "@/server/jobs/health";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import { runWorker } from "./runtime";

const shutdown = new AbortController();
let deadline: ReturnType<typeof setTimeout> | undefined;
function stop() {
  if (shutdown.signal.aborted) return;
  shutdown.abort();
  // Prisma/SDK operations are not all abortable. Leased jobs recover on restart.
  deadline = setTimeout(() => {
    console.error("Worker shutdown deadline exceeded.");
    void disconnect();
    process.exit(1);
  }, 10000);
  deadline.unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
try {
  const ok = await runWorker({
    tick: () => jobRunner().tick(),
    healthy: workerHealthy,
    signal: shutdown.signal,
    once: process.argv.includes("--once"),
  });
  if (!ok && process.argv.includes("--once")) process.exitCode = 1;
} catch {
  console.error("Worker could not start or continue.");
  process.exitCode = 1;
} finally {
  // Bound cleanup on startup failure and --once too, not only on signals.
  stop();
  await disconnect();
  clearTimeout(deadline);
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
}

async function disconnect() {
  try {
    getRedis().disconnect();
  } catch {
    process.exitCode = 1;
  }
  try {
    await getDb().$disconnect();
  } catch {
    process.exitCode = 1;
  }
}
