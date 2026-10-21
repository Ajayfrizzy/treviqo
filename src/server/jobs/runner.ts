import "server-only";
import { logRuntimeFailure } from "@/server/diagnostics/runtime";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import { reapExpiredAttempts } from "@/modules/extractions/persistence";
import { accountDeletionService } from "@/modules/account/service";
import { reminderService } from "@/modules/reminders/service";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import {
  HEARTBEAT,
  QUEUE,
  jobIds,
  popDue,
  retryDelay,
  validJob,
  type JobId,
} from "./queue";
export async function cleanExpiredSessions(db: PrismaClient, now: Date) {
  // Bounded, idempotent deletes; expiration is already enforced on every auth lookup.
  const ids = await db.authSession.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: 500,
  });
  await db.authSession.deleteMany({
    where: { id: { in: ids.map((row) => row.id) }, expiresAt: { lte: now } },
  });
  return ids.length === 500;
}
export function jobRunner(
  db: PrismaClient = getDb(),
  redis: Redis = getRedis(),
  clock = () => new Date(),
) {
  async function perform(id: JobId, cursor: string | null, token: string) {
    if (id === "extraction_cleanup")
      return { cursor: null, more: await reapExpiredAttempts(db, clock()) };
    if (id === "account_cleanup")
      return {
        cursor: null,
        more: await accountDeletionService(db).processDue(clock()),
      };
    if (id === "session_cleanup")
      return { cursor: null, more: await cleanExpiredSessions(db, clock()) };
    const started = Date.now();
    // Bound both transaction count and loop occupancy, below the 45s heartbeat TTL.
    for (let batch = 0; batch < 5 && Date.now() - started < 15000; batch++) {
      const row = await db.exitCase.findFirst({
        where: {
          ...(cursor ? { id: { gt: cursor } } : {}),
          user: { deletionScheduledFor: null, deletionStartedAt: null },
        },
        select: { id: true, userId: true },
        orderBy: { id: "asc" },
      });
      if (!row) return { cursor: null, more: false };
      try {
        const more = await reminderService(db).reconcileBatch(
          row.userId,
          row.id,
          clock(),
          async (tx, complete) => {
            const owned = await tx.$queryRaw<{ id: string }[]>`
              SELECT "id" FROM "BackgroundJob"
              WHERE "id" = ${id} AND "state" = 'running'
                AND "leaseToken" = ${token} AND "leaseUntil" > ${clock()}
              FOR UPDATE`;
            if (!owned.length) throw new Error("Worker lease unavailable");
            if (complete) {
              const saved = await tx.backgroundJob.updateMany({
                where: {
                  id,
                  state: "running",
                  leaseToken: token,
                  leaseUntil: { gt: clock() },
                },
                data: { cursor: row.id },
              });
              if (!saved.count) throw new Error("Worker lease unavailable");
            }
          },
        );
        if (!more) cursor = row.id;
      } catch (error) {
        if (
          error instanceof Error &&
          "status" in error &&
          error.status === 404
        ) {
          cursor = row.id;
          continue;
        }
        throw error;
      }
    }
    return { cursor, more: true };
  }

  return {
    async tick() {
      const now = clock();
      let phase: "worker_database" | "worker_redis" = "worker_redis";
      try {
        await redis.ping(); // No dependency failure may be mistaken for successful background work.
        phase = "worker_database";
        await db.backgroundJob.createMany({
          data: jobIds.map((id) => ({ id, dueAt: now })),
          skipDuplicates: true,
        });
        await db.backgroundJob.updateMany({
          where: { state: "running", leaseUntil: { lte: now } },
          data: {
            state: "pending",
            leaseToken: null,
            leaseUntil: null,
            dueAt: now,
            errorCode: "lease_expired",
            attempts: { increment: 1 },
          },
        });
        const due = await db.backgroundJob.findMany({
          where: {
            id: { in: [...jobIds] },
            state: "pending",
            dueAt: { lte: now },
          },
          select: { id: true, dueAt: true },
        });
        // PostgreSQL is the durable outbox. Loss of Redis contents is repaired each tick.
        phase = "worker_redis";
        for (const job of due)
          await redis.zadd(QUEUE, job.dueAt.getTime(), job.id);
        const id = await popDue(redis, now.getTime());
        if (id && validJob(id)) {
          phase = "worker_database";
          const token = randomUUID();
          const claim = await db.backgroundJob.updateMany({
            where: { id, state: "pending", dueAt: { lte: now } },
            data: {
              state: "running",
              leaseToken: token,
              leaseUntil: new Date(now.getTime() + 120000),
            },
          });
          if (claim.count) {
            const job = await db.backgroundJob.findUniqueOrThrow({
              where: { id },
            });
            try {
              const result = await perform(id, job.cursor, token);
              const end = clock();
              await db.backgroundJob.updateMany({
                where: {
                  id,
                  leaseToken: token,
                  state: "running",
                  leaseUntil: { gt: end },
                },
                data: {
                  state: "pending",
                  leaseToken: null,
                  leaseUntil: null,
                  cursor: result.cursor,
                  dueAt: new Date(end.getTime() + (result.more ? 0 : 60000)),
                  // Partial reminder progress is not a successful sweep.
                  ...(!(id === "reminders" && result.more)
                    ? { attempts: 0, errorCode: null }
                    : {}),
                  ...(!result.more ? { lastSucceededAt: end } : {}),
                },
              });
            } catch (error) {
              logRuntimeFailure("worker_job", error);
              console.error(`worker_job_failed job=${id}`);
              await db.backgroundJob.updateMany({
                where: {
                  id,
                  leaseToken: token,
                  state: "running",
                  leaseUntil: { gt: clock() },
                },
                data: {
                  state: "pending",
                  leaseToken: null,
                  leaseUntil: null,
                  dueAt: new Date(clock().getTime() + retryDelay(job.attempts)),
                  attempts: { increment: 1 },
                  errorCode: "job_failed",
                },
              });
            }
          }
        }
        phase = "worker_redis";
        await redis.set(HEARTBEAT, String(clock().getTime()), "EX", 45);
      } catch (error) {
        logRuntimeFailure(phase, error);
        throw error;
      }
    },
  };
}
