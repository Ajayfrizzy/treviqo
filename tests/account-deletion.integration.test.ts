import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import { getDb } from "@/server/db/client";
import { authenticateCredentials } from "@/modules/auth/credentials";
import { DELETION_GRACE_MS } from "@/modules/account/shared";
vi.mock("@/modules/auth/rate-limit", () => ({
  allowCredentialAttempt: async () => true,
}));
import { hashPassword } from "@/modules/auth/password";
import { accountDeletionService } from "@/modules/account/service";
import { documentService } from "@/modules/documents/service";
import {
  createAuthSession,
  isAuthSessionActive,
} from "@/modules/auth/session-store";
import { FakeStorage } from "./helpers/fake-storage";
const db = getDb(),
  password = " Synthetic account password 7! ";
const input = { password, confirmation: "DELETE" };
const pdf = readFileSync("tests/fixtures/document.pdf");
let hash: string, owner: string, other: string, job: string, otherJob: string;
let store: FakeStorage;
const allow = vi.fn(async () => true);
const service = (client = db) =>
  accountDeletionService(client, { storage: () => store, allow });
async function cleanupDue(client = db) {
  const user = await db.user.findUnique({ where: { id: owner } });
  if (user && !user.deletionScheduledFor)
    await service().schedule(owner, input);
  const current = await db.user.findUnique({ where: { id: owner } });
  return service(client).cleanup(
    owner,
    current?.deletionScheduledFor ?? new Date(),
  );
}
async function addDoc(
  userId = owner,
  employmentId = job,
  status: "ready" | "failed" | "deleted" | "uploaded" = "ready",
) {
  const doc = await db.employmentDocument.create({
    data: {
      userId,
      employmentId,
      status,
      originalFilename: "fixture.pdf",
      sanitizedFilename: "fixture.pdf",
      objectKey: `synthetic/${crypto.randomUUID()}`,
      mimeType: "application/pdf",
      fileSize: 5,
      checksum: "0".repeat(64),
    },
  });
  store.objects.set(doc.objectKey, pdf);
  return doc;
}
beforeAll(async () => {
  hash = await hashPassword(password);
});
beforeEach(async () => {
  vi.restoreAllMocks();
  allow.mockReset().mockResolvedValue(true);
  store = new FakeStorage();
  owner = (
    await db.user.create({
      data: {
        email: `delete-${crypto.randomUUID()}@example.test`,
        passwordHash: hash,
      },
    })
  ).id;
  other = (
    await db.user.create({
      data: {
        email: `keep-${crypto.randomUUID()}@example.test`,
        passwordHash: await hashPassword("Different password 8!"),
      },
    })
  ).id;
  job = (
    await db.employment.create({
      data: {
        userId: owner,
        employerName: "Fixture",
        roleTitle: "Worker",
        startDate: new Date("2026-01-01"),
      },
    })
  ).id;
  otherJob = (
    await db.employment.create({
      data: {
        userId: other,
        employerName: "Other",
        roleTitle: "Worker",
        startDate: new Date("2026-01-01"),
      },
    })
  ).id;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.auditEvent.deleteMany({ where: { userId: { in: [owner, other] } } });
  await db.employmentDocument.deleteMany({
    where: { userId: { in: [owner, other] } },
  });
  await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
});
afterAll(async () => {
  await db.$disconnect();
});
it("wrong password or confirmation cannot change intent, records, sessions or storage", async () => {
  await addDoc();
  const session = await createAuthSession(owner);
  for (const raw of [
    { ...input, password: "wrong" },
    { ...input, confirmation: "delete" },
    { ...input, userId: other },
  ])
    await expect(service().schedule(owner, raw)).rejects.toThrow();
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner } }))
      .deletionStartedAt,
  ).toBeNull();
  expect(await isAuthSessionActive(session.id, owner)).toBe(true);
  expect(store.removals).toBe(0);
});
it("reauthenticates with the untrimmed current password, removes every dependent table and revokes all sessions", async () => {
  const doc = await addDoc(),
    foreign = await addDoc(other, otherJob);
  const sessions = await Promise.all([
    createAuthSession(owner),
    createAuthSession(owner),
  ]);
  const otherSession = await createAuthSession(other);
  const run = await db.documentExtraction.create({
    data: {
      documentId: doc.id,
      userId: owner,
      status: "ready",
      sourceKind: "manual",
      model: "manual",
      promptVersion: "fixture",
      schemaVersion: "fixture",
    },
  });
  const field = await db.extractedField.create({
    data: {
      extractionId: run.id,
      key: "salary",
      proposedValue: "fixture",
      value: "fixture",
      confidence: "needs_review",
      reviewState: "corrected",
    },
  });
  const revision = await db.extractionFieldRevision.create({
    data: { fieldId: field.id, state: "corrected", value: "fixture" },
  });
  const exit = await db.exitCase.create({
    data: {
      userId: owner,
      employmentId: job,
      exitType: "resignation",
      lastWorkingDate: new Date("2026-10-01"),
    },
  });
  await db.reminder.create({
    data: {
      userId: owner,
      exitCaseId: exit.id,
      key: "fixture",
      kind: "exit_action",
      fingerprint: "fixture",
      dueAt: new Date(),
    },
  });
  await db.settlementItem.create({
    data: {
      userId: owner,
      exitCaseId: exit.id,
      category: "final_salary",
      label: "fixture",
      documentId: doc.id,
      expectedFieldId: field.id,
      expectedFieldVersion: 0,
      expectedPeriod: "2026-09",
      actualPeriod: "2026-09",
    },
  });
  await db.pensionVerification.create({
    data: { userId: owner, exitCaseId: exit.id, targetPeriod: "2026-09" },
  });
  await db.benefit.create({
    data: {
      userId: owner,
      employmentId: job,
      category: "hmo",
      contextHash: "fixture",
    },
  });
  await db.auditEvent.create({
    data: {
      userId: owner,
      employmentId: job,
      documentId: doc.id,
      action: "document_uploaded",
    },
  });
  await expect(db.user.delete({ where: { id: owner } })).rejects.toThrow(); // Real restrictive FKs.
  expect(await cleanupDue()).toEqual({ status: "deleted" });
  for (const session of sessions)
    expect(await isAuthSessionActive(session.id, owner)).toBe(false);
  expect(await isAuthSessionActive(otherSession.id, other)).toBe(true);
  expect(await db.user.findUnique({ where: { id: owner } })).toBeNull();
  expect(await db.employment.count({ where: { userId: owner } })).toBe(0);
  expect(await db.employmentDocument.count({ where: { userId: owner } })).toBe(
    0,
  );
  expect(await db.documentExtraction.count({ where: { userId: owner } })).toBe(
    0,
  );
  expect(
    await db.extractedField.findUnique({ where: { id: field.id } }),
  ).toBeNull();
  expect(
    await db.extractionFieldRevision.findUnique({ where: { id: revision.id } }),
  ).toBeNull();
  expect(await db.exitCase.count({ where: { userId: owner } })).toBe(0);
  expect(await db.reminder.count({ where: { userId: owner } })).toBe(0);
  expect(await db.settlementItem.count({ where: { userId: owner } })).toBe(0);
  expect(await db.pensionVerification.count({ where: { userId: owner } })).toBe(
    0,
  );
  expect(await db.benefit.count({ where: { userId: owner } })).toBe(0);
  expect(await db.auditEvent.count({ where: { userId: owner } })).toBe(0);
  expect(store.objects.has(doc.objectKey)).toBe(false);
  expect(store.objects.has(foreign.objectKey)).toBe(true);
  expect(
    await db.employmentDocument.findUnique({ where: { id: foreign.id } }),
  ).not.toBeNull();
});
it("retains a disabled account on AccessDenied, blocks uploads/access, and permits worker retry", async () => {
  const doc = await addDoc();
  const session = await createAuthSession(owner);
  store.failDelete = true;
  await expect(cleanupDue()).rejects.toThrow();
  await expect(cleanupDue()).rejects.toThrow();
  expect(store.objects.has(doc.objectKey)).toBe(true);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner } }))
      .deletionStartedAt,
  ).not.toBeNull();
  expect(
    (await db.employmentDocument.findUniqueOrThrow({ where: { id: doc.id } }))
      .storagePurgedAt,
  ).toBeNull();
  expect(await isAuthSessionActive(session.id, owner)).toBe(false);
  const documents = documentService(db, () => store);
  await expect(
    documents.upload(
      owner,
      { employmentId: job },
      pdf,
      "fixture.pdf",
      "application/pdf",
      100000,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(documents.access(owner, doc.id)).rejects.toMatchObject({
    status: 409,
  });
  expect(store.writes).toBe(0);
  store.failDelete = false;
  expect(await cleanupDue()).toEqual({ status: "deleted" });
  expect(await isAuthSessionActive(session.id, owner)).toBe(false);
});
it("removes failed and historically deleted objects, checkpoints partial cleanup, and resumes in bounded batches", async () => {
  for (const status of ["ready", "failed", "deleted", "ready"] as const)
    await addDoc(owner, job, status);
  const foreign = await addDoc(other, otherJob);
  expect(await cleanupDue()).toEqual({ status: "pending" });
  expect(
    await db.employmentDocument.count({
      where: { userId: owner, storagePurgedAt: { not: null } },
    }),
  ).toBe(3);
  const removals = store.removals;
  expect(await cleanupDue()).toEqual({ status: "deleted" });
  expect(store.removals).toBe(removals + 1);
  expect([...store.objects.keys()]).toEqual([foreign.objectKey]);
});
it("recovers when object deletion succeeds but its checkpoint fails", async () => {
  const doc = await addDoc();
  const guarded = db.$extends({
    query: {
      employmentDocument: {
        async updateMany({ args, query }) {
          if (args.data.storagePurgedAt)
            throw new Error("checkpoint unavailable");
          return query(args);
        },
      },
    },
  });
  await expect(cleanupDue(guarded as unknown as typeof db)).rejects.toThrow();
  expect(store.objects.size).toBe(0);
  expect(
    (await db.employmentDocument.findUniqueOrThrow({ where: { id: doc.id } }))
      .storagePurgedAt,
  ).toBeNull();
  expect(await cleanupDue()).toEqual({ status: "deleted" });
});
it("rolls back all database/session cleanup when final User deletion fails, then resumes without re-purging", async () => {
  await addDoc();
  const session = await createAuthSession(owner);
  const guarded = db.$extends({
    query: {
      user: {
        async delete() {
          throw new Error("transaction failure");
        },
      },
    },
  });
  await expect(cleanupDue(guarded as unknown as typeof db)).rejects.toThrow(
    "transaction failure",
  );
  expect(await db.employment.count({ where: { userId: owner } })).toBe(1);
  expect(await db.employmentDocument.count({ where: { userId: owner } })).toBe(
    1,
  );
  expect(await isAuthSessionActive(session.id, owner)).toBe(false);
  const count = store.removals;
  expect(await cleanupDue()).toEqual({ status: "deleted" });
  expect(store.removals).toBe(count);
});
it("rejects cross-user password use and unauthenticated or repeated stale calls", async () => {
  await expect(service().schedule(other, input)).rejects.toMatchObject({
    status: 403,
  });
  await expect(service().schedule("", input)).rejects.toMatchObject({
    status: 401,
  });
  expect(await cleanupDue()).toEqual({ status: "deleted" });
  await expect(service().schedule(owner, input)).rejects.toMatchObject({
    status: 403,
  });
  expect(await db.user.findUnique({ where: { id: other } })).not.toBeNull();
});
it("schedules unfinished reservations without deleting files during the grace period", async () => {
  await addDoc(owner, job, "uploaded");
  await service().schedule(owner, input);
  expect(store.removals).toBe(0);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner } }))
      .deletionStartedAt,
  ).toBeNull();
  expect(await service().cleanup(owner)).toEqual({ status: "not_due" });
  expect(await cleanupDue()).toEqual({ status: "deleted" });
});

it("serializes against an in-flight storage PUT and never deletes its key before the upload finishes", async () => {
  let finish!: () => void, began!: () => void;
  const writing = new Promise<void>((resolve) => {
    began = resolve;
  });
  const release = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const put = store.put.bind(store);
  vi.spyOn(store, "put").mockImplementation(async (key, bytes) => {
    began();
    await release;
    await put(key, bytes);
  });
  const uploading = documentService(db, () => store).upload(
    owner,
    { employmentId: job },
    pdf,
    "fixture.pdf",
    "application/pdf",
    100000,
  );
  await writing;
  const deleting = cleanupDue().then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  finish();
  await uploading;
  const outcome = await deleting;
  if ("error" in outcome) {
    expect(outcome.error.status).toBe(409);
    await cleanupDue();
  }
  expect(store.objects.size).toBe(0);
  expect(await db.user.findUnique({ where: { id: owner } })).toBeNull();
});
it("fails closed when password throttling is exhausted or unavailable", async () => {
  await addDoc();
  allow.mockResolvedValueOnce(false);
  await expect(cleanupDue()).rejects.toMatchObject({
    status: 429,
  });
  allow.mockRejectedValueOnce(new Error("cache unavailable"));
  await expect(cleanupDue()).rejects.toThrow();
  expect(store.removals).toBe(0);
});

it("schedules exactly seven days ahead, preserves data, revokes every session and blocks new sessions/uploads", async () => {
  const doc = await addDoc();
  await createAuthSession(owner);
  await createAuthSession(owner);
  const now = new Date();
  const scheduling = accountDeletionService(db, {
    allow,
    clock: () => now,
    storage: () => store,
  });
  const result = await scheduling.schedule(owner, input);
  expect(Date.parse(result.deletionScheduledFor) - now.getTime()).toBe(
    DELETION_GRACE_MS,
  );
  expect(await scheduling.schedule(owner, input)).toEqual(result);
  expect(store.removals).toBe(0);
  expect(await db.authSession.count({ where: { userId: owner } })).toBe(0);
  expect(
    await db.employmentDocument.findUnique({ where: { id: doc.id } }),
  ).not.toBeNull();
  await expect(createAuthSession(owner)).rejects.toThrow();
  await expect(
    documentService(db, () => store).upload(
      owner,
      { employmentId: job },
      pdf,
      "fixture.pdf",
      "application/pdf",
      100000,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const scheduled = new Date(result.deletionScheduledFor);
  expect(
    await scheduling.cleanup(owner, new Date(scheduled.getTime() - 1)),
  ).toEqual({ status: "not_due" });
  expect(await scheduling.cleanup(owner, scheduled)).toEqual({
    status: "deleted",
  });
  expect(await scheduling.cleanup(owner, scheduled)).toEqual({
    status: "deleted",
  });
});

it("reveals pending state only after password verification, cancels safely, and creates a fresh session", async () => {
  const { email } = await db.user.findUniqueOrThrow({ where: { id: owner } });
  const old = await createAuthSession(owner);
  const result = await service().schedule(owner, input);
  expect(
    await authenticateCredentials({ email, password: "wrong" }),
  ).toBeNull();
  expect(
    await authenticateCredentials({
      email,
      password: "wrong",
      cancelDeletion: "true",
    }),
  ).toBeNull();
  await expect(authenticateCredentials({ email, password })).rejects.toThrow(
    `DeletionPending:${result.deletionScheduledFor}`,
  );
  expect(await db.authSession.count({ where: { userId: owner } })).toBe(0);
  expect(
    await authenticateCredentials({ email, password, cancelDeletion: "true" }),
  ).toEqual({ id: owner });
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner } }))
      .deletionScheduledFor,
  ).toBeNull();
  const fresh = await createAuthSession(owner);
  expect(fresh.id).not.toBe(old.id);
  expect(await isAuthSessionActive(old.id, owner)).toBe(false);
  expect(await isAuthSessionActive(fresh.id, owner)).toBe(true);
});

it("rejects cancellation at the deadline and during irreversible processing", async () => {
  const user = await db.user.findUniqueOrThrow({ where: { id: owner } });
  await service().schedule(owner, input);
  await db.user.update({
    where: { id: owner },
    data: { deletionScheduledFor: new Date(0) },
  });
  await expect(
    authenticateCredentials({
      email: user.email,
      password,
      cancelDeletion: "true",
    }),
  ).rejects.toThrow("DeletionProcessing");
  await db.user.update({
    where: { id: owner },
    data: {
      deletionStartedAt: new Date(),
      deletionScheduledFor: new Date(Date.now() + DELETION_GRACE_MS),
    },
  });
  await expect(
    authenticateCredentials({
      email: user.email,
      password,
      cancelDeletion: "true",
    }),
  ).rejects.toThrow("DeletionProcessing");
});

it("backs off failed worker cleanup, keeps the user disabled, and retries absent objects idempotently", async () => {
  const doc = await addDoc();
  const scheduled = await service().schedule(owner, input);
  const now = new Date(scheduled.deletionScheduledFor);
  store.failDelete = true;
  expect(await service().processDue(new Date(now.getTime() - 1))).toBe(false);
  expect(await service().processDue(now)).toBe(true);
  const failed = await db.user.findUniqueOrThrow({ where: { id: owner } });
  expect(failed.deletionStartedAt).not.toBeNull();
  expect(failed.deletionAttempts).toBe(1);
  expect(failed.deletionRetryAt!.getTime()).toBe(now.getTime() + 10000);
  expect(await service().processDue(now)).toBe(false);
  store.failDelete = false;
  store.objects.delete(doc.objectKey); // Already manually absent is successful cleanup.
  expect(await service().processDue(failed.deletionRetryAt!)).toBe(true);
  expect(await db.user.findUnique({ where: { id: owner } })).toBeNull();
  expect(await service().processDue(failed.deletionRetryAt!)).toBe(false);
});

it("rolls scheduling back if its audit cannot commit, retaining active sessions", async () => {
  const session = await createAuthSession(owner);
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
    service(guarded as unknown as typeof db).schedule(owner, input),
  ).rejects.toThrow("audit unavailable");
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner } }))
      .deletionScheduledFor,
  ).toBeNull();
  expect(await isAuthSessionActive(session.id, owner)).toBe(true);
});

it("records scheduling once and cancellation without credentials or document details", async () => {
  await service().schedule(owner, input);
  await service().schedule(owner, input);
  const account = await db.user.findUniqueOrThrow({ where: { id: owner } });
  await authenticateCredentials({
    email: account.email,
    password,
    cancelDeletion: "true",
  });
  const events = await db.auditEvent.findMany({
    where: { userId: owner },
    orderBy: { createdAt: "asc" },
  });
  expect(events.map((event) => event.action)).toEqual([
    "account_deletion_scheduled",
    "account_deletion_cancelled",
  ]);
  expect(events.every((event) => event.employmentId === null)).toBe(true);
  expect(JSON.stringify(events)).not.toContain(password);
});

it("deletes User only after child deletion operations have succeeded", async () => {
  await addDoc();
  const operations: string[] = [];
  const traced = db.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (operation === "delete" || operation === "deleteMany")
            operations.push(`${model}.${operation}`);
          return result;
        },
      },
    },
  });
  await cleanupDue(traced as unknown as typeof db);
  expect(operations.at(-1)).toBe("User.delete");
  expect(operations).toContain("EmploymentDocument.deleteMany");
  expect(operations).toContain("Employment.deleteMany");
  expect(operations).toContain("AuditEvent.deleteMany");
});

it("a stale worker selection cannot recreate cleanup metadata after cancellation", async () => {
  const scheduled = await service().schedule(owner, input);
  const account = await db.user.findUniqueOrThrow({ where: { id: owner } });
  const guarded = db.$extends({
    query: {
      user: {
        async findFirst({ args, query }) {
          const result = await query(args);
          await authenticateCredentials({
            email: account.email,
            password,
            cancelDeletion: "true",
          });
          return result;
        },
      },
    },
  });
  await service(guarded as unknown as typeof db).processDue(
    new Date(scheduled.deletionScheduledFor),
  );
  const current = await db.user.findUniqueOrThrow({ where: { id: owner } });
  expect(current.deletionScheduledFor).toBeNull();
  expect(current.deletionStartedAt).toBeNull();
  expect(current.deletionRetryAt).toBeNull();
  expect(store.removals).toBe(0);
});
