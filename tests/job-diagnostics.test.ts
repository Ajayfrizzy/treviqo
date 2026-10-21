import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/modules/account/service", () => ({
  accountDeletionService: vi.fn(),
}));
vi.mock("@/modules/reminders/service", () => ({ reminderService: vi.fn() }));
vi.mock("@/modules/extractions/persistence", () => ({
  reapExpiredAttempts: vi.fn(),
}));
import { jobRunner } from "@/server/jobs/runner";
const now = new Date("2026-10-20T04:30:00Z");
function fixture() {
  const db = {
    backgroundJob: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "session_cleanup", dueAt: now }]),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ cursor: null, attempts: 0 }),
    },
    authSession: { findMany: vi.fn(), deleteMany: vi.fn() },
  };
  const redis = {
    ping: vi.fn().mockResolvedValue("PONG"),
    zadd: vi.fn(),
    eval: vi.fn().mockResolvedValue("session_cleanup"),
    set: vi.fn(),
  };
  return {
    db,
    redis,
    runner: jobRunner(
      db as unknown as PrismaClient,
      redis as unknown as Redis,
      () => now,
    ),
  };
}
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());
it("distinguishes Redis tick failure and does not record a heartbeat", async () => {
  const { db, redis, runner } = fixture();
  const error = Object.assign(new Error("private Redis URL"), {
    code: "ECONNREFUSED",
  });
  redis.ping.mockRejectedValue(error);
  await expect(runner.tick()).rejects.toBe(error);
  expect(db.backgroundJob.createMany).not.toHaveBeenCalled();
  expect(redis.set).not.toHaveBeenCalled();
  expect(process.stderr.write).toHaveBeenCalledWith(
    "runtime_failed operation=worker_redis category=connection_refused\n",
  );
});
it("distinguishes database tick failure from Redis connectivity", async () => {
  const { db, redis, runner } = fixture();
  const error = Object.assign(new Error("private DB URL"), {
    errorCode: "P1001",
  });
  db.backgroundJob.createMany.mockRejectedValue(error);
  await expect(runner.tick()).rejects.toBe(error);
  expect(redis.set).not.toHaveBeenCalled();
  expect(process.stderr.write).toHaveBeenCalledWith(
    "runtime_failed operation=worker_database category=database_connectivity\n",
  );
});
it("logs a caught job failure while preserving fenced retry and heartbeat", async () => {
  const { db, redis, runner } = fixture();
  db.authSession.findMany.mockRejectedValue(
    Object.assign(new Error("private query"), { code: "P2028" }),
  );
  await runner.tick();
  expect(db.backgroundJob.updateMany).toHaveBeenLastCalledWith({
    where: {
      id: "session_cleanup",
      leaseToken: expect.any(String),
      state: "running",
      leaseUntil: { gt: now },
    },
    data: {
      state: "pending",
      leaseToken: null,
      leaseUntil: null,
      dueAt: new Date(now.getTime() + 10000),
      attempts: { increment: 1 },
      errorCode: "job_failed",
    },
  });
  expect(redis.set).toHaveBeenCalledWith(
    "treviqo:worker:heartbeat",
    String(now.getTime()),
    "EX",
    45,
  );
  expect(process.stderr.write).toHaveBeenCalledWith(
    "runtime_failed operation=worker_job category=database_transaction\n",
  );
  expect(console.error).toHaveBeenCalledWith(
    "worker_job_failed job=session_cleanup",
  );
});
it("surfaces failed retry persistence as a database tick failure without a heartbeat", async () => {
  const { db, redis, runner } = fixture();
  db.authSession.findMany.mockRejectedValue(new Error("private job error"));
  const error = Object.assign(new Error("private database error"), {
    code: "P1017",
  });
  // Reclaim and claim succeed, then persisting the caught job failure fails.
  db.backgroundJob.updateMany
    .mockResolvedValueOnce({ count: 0 })
    .mockResolvedValueOnce({ count: 1 })
    .mockRejectedValueOnce(error);
  await expect(runner.tick()).rejects.toBe(error);
  expect(redis.set).not.toHaveBeenCalled();
  expect(process.stderr.write).toHaveBeenCalledWith(
    "runtime_failed operation=worker_database category=database_connection_closed\n",
  );
});
