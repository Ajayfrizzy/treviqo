import { workerHealthy } from "@/server/jobs/health";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
try {
  if (!(await workerHealthy())) process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  await getDb().$disconnect();
  getRedis().disconnect();
}
