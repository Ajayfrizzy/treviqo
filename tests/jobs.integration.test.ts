import { EXTRACTION_LEASE_MS } from "@/modules/extractions/persistence";
import { beforeEach, afterEach, afterAll, expect, it, vi } from "vitest";
import Redis from "ioredis";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import { exitService } from "@/modules/exits/service";
import {
  reminderService,
  REMINDER_ACTION_BATCH,
  REMINDER_TRANSACTION_MS,
} from "@/modules/reminders/service";
import { jobRunner, cleanExpiredSessions } from "@/server/jobs/runner";
import { workerHealthy } from "@/server/jobs/health";
import { HEARTBEAT, QUEUE } from "@/server/jobs/queue";
import { limitWorkflow, limits, WorkflowLimit } from "@/server/rate-limit";
const db = getDb(),
  redis = getRedis();
let a: string, b: string, job: string, id: string;
const now = () => new Date();
beforeEach(async () => {
  await db.backgroundJob.deleteMany();
  await redis.del(QUEUE, HEARTBEAT);
  // These scenarios target reminder/session jobs, independently of cleanup order.
  await db.backgroundJob.createMany({
    data: ["account_cleanup", "extraction_cleanup"].map((id) => ({
      id,
      dueAt: new Date(Date.now() + 3600000),
    })),
  });
  a = (await db.user.create({ data: {} })).id;
  b = (await db.user.create({ data: {} })).id;
  job = (
    await db.employment.create({
      data: {
        userId: a,
        employerName: "Fixture",
        roleTitle: "Worker",
        startDate: new Date("2020-01-01"),
      },
    })
  ).id;
  id = (
    await exitService(db).create(a, {
      employmentId: job,
      answers: {
        exitType: "resignation",
        lastWorkingDate: "2024-01-01",
        pension: "yes",
      },
    })
  ).id;
  await db.exitCase.update({
    where: { id },
    data: {
      createdAt: new Date("2023-12-01"),
      updatedAt: new Date("2023-12-01"),
    },
  });
});
afterEach(async () => {
  await db.auditEvent.deleteMany({ where: { userId: { in: [a, b] } } });
  await db.user.deleteMany({ where: { id: { in: [a, b] } } });
  await db.backgroundJob.deleteMany();
  await redis.del(QUEUE, HEARTBEAT);
  vi.restoreAllMocks();
});
afterAll(async () => {
  await db.$disconnect();
  redis.disconnect();
});
it("reconciles idempotently, audits once, revalidates reads and resolves fixed actions", async () => {
  const service = reminderService(db);
  await service.reconcile(a, id);
  const rows = await service.list(a);
  expect(rows.some((row) => row.kind === "stale_action")).toBe(true);
  const count = await db.auditEvent.count({
    where: { exitCaseId: id, action: "reminder_created" },
  });
  await service.reconcile(a, id);
  expect(
    await db.auditEvent.count({
      where: { exitCaseId: id, action: "reminder_created" },
    }),
  ).toBe(count);
  const exit = await exitService(db).detail(a, id);
  await exitService(db).update(a, id, {
    version: 0,
    answers: { ...exit.answers, noticeApplicable: "no" },
  });
  expect(
    (await service.list(a)).some((row) => row.title === "Notice and dates"),
  ).toBe(false);
  await service.reconcile(a, id);
  expect(
    await db.reminder.findUnique({
      where: { exitCaseId_key: { exitCaseId: id, key: "notice" } },
    }),
  ).toMatchObject({ state: "resolved" });
});
it("isolates owners, protects stale commands and snoozes without changing the underlying case", async () => {
  const service = reminderService(db);
  await service.reconcile(a, id);
  const row = (await service.list(a))[0]!;
  expect(await service.list(b)).toEqual([]);
  await expect(
    service.command(b, { id: row.id, version: row.version, action: "dismiss" }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(service.list("")).rejects.toMatchObject({ status: 401 });
  await service.command(a, {
    id: row.id,
    version: row.version,
    action: "snooze",
  });
  expect((await service.list(a)).some((item) => item.id === row.id)).toBe(
    false,
  );
  await expect(
    service.command(a, { id: row.id, version: row.version, action: "dismiss" }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await exitService(db).detail(a, id)).version).toBe(0);
  await expect(
    db.reminder.update({ where: { id: row.id }, data: { userId: b } }),
  ).rejects.toThrow();
});
it("rolls back reminder state if its audit fails", async () => {
  const guarded = db.$extends({
    query: {
      auditEvent: {
        async create() {
          throw new Error("audit unavailable");
        },
      },
    },
  });
  await expect(
    reminderService(guarded as unknown as typeof db).reconcile(a, id),
  ).rejects.toThrow();
  expect(await db.reminder.count({ where: { exitCaseId: id } })).toBe(0);
});
it("dispatches durable jobs through Redis and recovers queue loss without duplicate reminders", async () => {
  const runner = jobRunner(db, redis);
  await runner.tick();
  await runner.tick();
  await runner.tick();
  expect(await workerHealthy()).toBe(true);
  expect(
    await db.reminder.count({ where: { exitCaseId: id } }),
  ).toBeGreaterThan(0);
  await redis.del(QUEUE);
  await db.backgroundJob.updateMany({ data: { dueAt: new Date(0) } });
  const count = await db.auditEvent.count({
    where: { exitCaseId: id, action: "reminder_created" },
  });
  await runner.tick();
  await runner.tick();
  await runner.tick();
  expect(
    await db.auditEvent.count({
      where: { exitCaseId: id, action: "reminder_created" },
    }),
  ).toBe(count);
});
it("recovers an expired lease and fences completion with a replaced token", async () => {
  await db.backgroundJob.create({
    data: {
      id: "reminders",
      state: "running",
      leaseToken: "dead-worker",
      leaseUntil: new Date(0),
      dueAt: new Date(0),
    },
  });
  await jobRunner(db, redis).tick();
  expect(
    await db.backgroundJob.findUnique({ where: { id: "reminders" } }),
  ).toMatchObject({ state: "pending", leaseToken: null, attempts: 0 });
  expect(
    (
      await db.backgroundJob.updateMany({
        where: { id: "reminders", leaseToken: "dead-worker" },
        data: { cursor: "unsafe" },
      })
    ).count,
  ).toBe(0);
});
it("keeps failed jobs retryable with backoff and no partial reminder audit", async () => {
  const guarded = db.$extends({
    query: {
      auditEvent: {
        async create() {
          throw new Error("unavailable");
        },
      },
    },
  });
  await jobRunner(guarded as unknown as typeof db, redis).tick();
  const row = await db.backgroundJob.findUniqueOrThrow({
    where: { id: "reminders" },
  });
  expect(row).toMatchObject({
    state: "pending",
    attempts: 1,
    errorCode: "job_failed",
  });
  expect(row.dueAt.getTime()).toBeGreaterThan(Date.now());
  expect(await db.reminder.count()).toBe(0);
  await db.backgroundJob.update({
    where: { id: "reminders" },
    data: { dueAt: new Date(0) },
  });
  await jobRunner(db, redis).tick();
  expect(
    await db.reminder.count({ where: { exitCaseId: id } }),
  ).toBeGreaterThan(0);
});
it("cleans only expired sessions, safely across repeated bounded runs", async () => {
  const active = await db.authSession.create({
    data: { userId: a, expiresAt: new Date(Date.now() + 100000) },
  });
  await db.authSession.createMany({
    data: Array.from({ length: 501 }, () => ({
      userId: a,
      expiresAt: new Date(0),
    })),
  });
  expect(await cleanExpiredSessions(db, now())).toBe(true);
  await cleanExpiredSessions(db, now());
  await cleanExpiredSessions(db, now());
  expect(await db.authSession.count({ where: { userId: a } })).toBe(1);
  expect(
    await db.authSession.findUnique({ where: { id: active.id } }),
  ).not.toBeNull();
});
it("rejects Redis failure without falsely marking jobs complete; health detects missing heartbeat and stalled jobs", async () => {
  const failed = new Redis("redis://127.0.0.1:1", {
    connectTimeout: 100,
    commandTimeout: 100,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  failed.on("error", () => {});
  try {
    await expect(jobRunner(db, failed).tick()).rejects.toThrow();
    expect(
      await db.backgroundJob.count({
        where: { id: { notIn: ["account_cleanup", "extraction_cleanup"] } },
      }),
    ).toBe(0);
  } finally {
    failed.disconnect();
  }
  expect(await workerHealthy()).toBe(false);
  await jobRunner(db, redis).tick();
  await jobRunner(db, redis).tick();
  await db.backgroundJob.update({
    where: { id: "reminders" },
    data: { attempts: 5 },
  });
  expect(await workerHealthy()).toBe(false);
});
it("enforces each workflow limit atomically with expiring keys and isolated owners", async () => {
  for (const scope of Object.keys(limits) as (keyof typeof limits)[]) {
    const maximum = limits[scope][0];
    for (let i = 0; i < maximum; i++) await limitWorkflow(a, scope);
    await expect(limitWorkflow(a, scope)).rejects.toBeInstanceOf(WorkflowLimit);
    await expect(limitWorkflow(b, scope)).resolves.toBeUndefined();
  }
});
it("checkpoints bounded scans and eventually reaches later exit cases", async () => {
  for (let index = 0; index < 20; index++) {
    const employment = await db.employment.create({
      data: {
        userId: a,
        employerName: "Fixture",
        roleTitle: "Worker",
        startDate: new Date("2020-01-01"),
      },
    });
    await db.exitCase.create({
      data: {
        userId: a,
        employmentId: employment.id,
        exitType: "resignation",
        lastWorkingDate: new Date("2024-01-01"),
      },
    });
  }
  const runner = jobRunner(db, redis);
  await runner.tick();
  expect(
    (await db.backgroundJob.findUniqueOrThrow({ where: { id: "reminders" } }))
      .cursor,
  ).not.toBeNull();
  for (let tick = 0; tick < 100; tick++) {
    await jobRunner(db, redis).tick(); // a new runner must resume the persisted cursor
    const state = await db.backgroundJob.findUniqueOrThrow({
      where: { id: "reminders" },
    });
    if (state.lastSucceededAt) break;
  }
  expect(
    (await db.backgroundJob.findUniqueOrThrow({ where: { id: "reminders" } }))
      .cursor,
  ).toBeNull();
  expect((await db.reminder.groupBy({ by: ["exitCaseId"] })).length).toBe(21);
});
it("concurrent workers do not duplicate reminder records or creation audits", async () => {
  const runner = jobRunner(db, redis);
  await Promise.all([runner.tick(), runner.tick()]);
  const rows = await db.reminder.findMany({ where: { exitCaseId: id } });
  expect(rows.length).toBeGreaterThan(0);
  expect(
    await db.auditEvent.count({
      where: { exitCaseId: id, action: "reminder_created" },
    }),
  ).toBe(rows.length);
});

it("dispatches extraction expiry through the durable worker outbox", async () => {
  const document = await db.employmentDocument.create({
    data: {
      userId: a,
      employmentId: job,
      originalFilename: "fixture.pdf",
      sanitizedFilename: "fixture.pdf",
      objectKey: `fixture-expiry-${a}`,
      mimeType: "application/pdf",
      fileSize: 1,
      checksum: "fixture",
      status: "ready",
    },
  });
  try {
    const run = await db.documentExtraction.create({
      data: {
        userId: a,
        documentId: document.id,
        model: "fixture",
        sourceKind: "pdf_text",
        promptVersion: "test",
        schemaVersion: "test",
        createdAt: new Date(Date.now() - EXTRACTION_LEASE_MS - 1000),
      },
    });
    await db.backgroundJob.createMany({
      data: ["reminders", "session_cleanup"].map((id) => ({
        id,
        dueAt: new Date(Date.now() + 3600000),
      })),
      skipDuplicates: true,
    });
    await db.backgroundJob.update({
      where: { id: "extraction_cleanup" },
      data: { dueAt: new Date(0) },
    });
    await jobRunner(db, redis).tick();
    expect(
      await db.documentExtraction.findUnique({ where: { id: run.id } }),
    ).toMatchObject({ status: "failed", errorCode: "interrupted" });
    expect(
      await db.backgroundJob.findUnique({
        where: { id: "extraction_cleanup" },
      }),
    ).toMatchObject({ attempts: 0, lastSucceededAt: expect.any(Date) });
  } finally {
    await db.employmentDocument.delete({ where: { id: document.id } });
  }
});

it("commits bounded actions, survives interruption and revalidates changed answers", async () => {
  expect(await reminderService(db).reconcileBatch(a, id)).toBe(true);
  expect(await db.reminder.count({ where: { exitCaseId: id } })).toBe(
    REMINDER_ACTION_BATCH,
  );
  const exit = await exitService(db).detail(a, id);
  await exitService(db).update(a, id, {
    version: exit.version,
    answers: { ...exit.answers, noticeApplicable: "no" },
  });
  await reminderService(db).reconcile(a, id); // new instance after interruption
  await reminderService(db).reconcile(a, id);
  const rows = await db.reminder.findMany({ where: { exitCaseId: id } });
  expect(rows.find((row) => row.key === "notice")?.state).toBe("resolved");
  expect(
    await db.auditEvent.count({
      where: { exitCaseId: id, action: "reminder_created" },
    }),
  ).toBe(rows.length);
});

it("retains partial progress and attempts until a retried sweep completes", async () => {
  await db.backgroundJob.create({
    data: { id: "reminders", attempts: 30, dueAt: new Date(0) },
  });
  let writes = 0;
  const guarded = db.$extends({
    query: {
      auditEvent: {
        async create({ args, query }) {
          if (++writes > REMINDER_ACTION_BATCH) throw new Error("interrupted");
          return query(args);
        },
      },
    },
  });
  await jobRunner(guarded as unknown as typeof db, redis).tick();
  const failed = await db.backgroundJob.findUniqueOrThrow({
    where: { id: "reminders" },
  });
  expect(failed).toMatchObject({
    attempts: 31,
    cursor: null,
    lastSucceededAt: null,
  });
  expect(failed.dueAt.getTime() - Date.now()).toBeGreaterThan(1790000);
  expect(await db.reminder.count({ where: { exitCaseId: id } })).toBe(
    REMINDER_ACTION_BATCH,
  );
  // Test clock reaches the eligible retry; production attempts/due times are never reset.
  const later = new Date(failed.dueAt.getTime() + 1);
  for (let tick = 0; tick < 5; tick++)
    await jobRunner(db, redis, () => later).tick();
  expect(
    await db.backgroundJob.findUnique({ where: { id: "reminders" } }),
  ).toMatchObject({ attempts: 0, cursor: null, lastSucceededAt: later });
  const count = await db.reminder.count({ where: { exitCaseId: id } });
  expect(
    await db.auditEvent.count({
      where: { exitCaseId: id, action: "reminder_created" },
    }),
  ).toBe(count);
});

it("rolls back actions when its lease expires inside a transaction and recovers safely", async () => {
  let time = new Date();
  const start = time;
  let expired = false;
  const guarded = db.$extends({
    query: {
      auditEvent: {
        async create({ args, query }) {
          if (!expired) {
            expired = true;
            time = new Date(start.getTime() + 121000);
          }
          return query(args);
        },
      },
    },
  });
  await jobRunner(guarded as unknown as typeof db, redis, () => time).tick();
  expect(await db.reminder.count({ where: { exitCaseId: id } })).toBe(0);
  expect(
    await db.auditEvent.count({
      where: { exitCaseId: id, action: "reminder_created" },
    }),
  ).toBe(0);
  expect(
    await db.backgroundJob.findUnique({ where: { id: "reminders" } }),
  ).toMatchObject({ state: "running", cursor: null });
  for (let tick = 0; tick < 5; tick++)
    await jobRunner(db, redis, () => time).tick();
  expect(
    await db.backgroundJob.findUnique({ where: { id: "reminders" } }),
  ).toMatchObject({ state: "pending", attempts: 0, lastSucceededAt: time });
});

it("finishes a workload longer than five seconds without a five-second transaction", async () => {
  const delayed = db.$extends({
    query: {
      $allOperations: async ({ args, query }) => {
        await new Promise((resolve) => setTimeout(resolve, 180));
        return query(args);
      },
    },
  });
  const durations: number[] = [];
  const started = performance.now();
  let more = true;
  while (more) {
    const batch = performance.now();
    more = await reminderService(
      delayed as unknown as typeof db,
    ).reconcileBatch(a, id);
    durations.push(performance.now() - batch);
  }
  expect(performance.now() - started).toBeGreaterThan(5000);
  expect(durations.length).toBeGreaterThan(1);
  expect(Math.max(...durations)).toBeLessThan(REMINDER_TRANSACTION_MS);
  console.info(
    `reminder_batch_measurement batches=${durations.length} max_ms=${Math.ceil(Math.max(...durations))}`,
  );
}, 30000);

it("a replaced token fences reminder writes, not just the final cursor update", async () => {
  let replaced = false;
  const guarded = db.$extends({
    query: {
      exitCase: {
        async findFirst({ args, query }) {
          if (!replaced) {
            replaced = true;
            await db.backgroundJob.update({
              where: { id: "reminders" },
              data: { leaseToken: "new-owner" },
            });
          }
          return query(args);
        },
      },
    },
  });
  await jobRunner(guarded as unknown as typeof db, redis).tick();
  expect(await db.reminder.count({ where: { exitCaseId: id } })).toBe(0);
  expect(
    await db.backgroundJob.findUnique({ where: { id: "reminders" } }),
  ).toMatchObject({
    state: "running",
    leaseToken: "new-owner",
    attempts: 0,
    cursor: null,
  });
});

it("preserves the completed-case cursor when subsequent work fails before tick completion", async () => {
  const guarded = db.$extends({
    query: {
      exitCase: {
        async findFirst({ args, query }) {
          if (
            args.where?.id &&
            typeof args.where.id === "object" &&
            args.where.id.gt
          )
            throw new Error("interrupted after case checkpoint");
          return query(args);
        },
      },
    },
  });
  await jobRunner(guarded as unknown as typeof db, redis).tick();
  const failed = await db.backgroundJob.findUniqueOrThrow({
    where: { id: "reminders" },
  });
  expect(failed).toMatchObject({
    cursor: id,
    attempts: 1,
    lastSucceededAt: null,
  });
  const audits = await db.auditEvent.count({
    where: { exitCaseId: id, action: "reminder_created" },
  });
  for (let tick = 0; tick < 5; tick++)
    await jobRunner(
      db,
      redis,
      () => new Date(failed.dueAt.getTime() + 1),
    ).tick();
  expect(
    await db.backgroundJob.findUnique({ where: { id: "reminders" } }),
  ).toMatchObject({
    cursor: null,
    attempts: 0,
    lastSucceededAt: expect.any(Date),
  });
  expect(
    await db.auditEvent.count({
      where: { exitCaseId: id, action: "reminder_created" },
    }),
  ).toBe(audits);
});
