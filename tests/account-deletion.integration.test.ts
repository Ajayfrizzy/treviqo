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
    await expect(service().remove(owner, raw)).rejects.toThrow();
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
  expect(await service().remove(owner, input)).toEqual({ status: "deleted" });
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
it("retains a recoverable account on AccessDenied, blocks uploads/access, and permits explicit retry", async () => {
  const doc = await addDoc();
  const session = await createAuthSession(owner);
  store.failDelete = true;
  await expect(service().remove(owner, input)).rejects.toThrow();
  await expect(service().remove(owner, input)).rejects.toThrow();
  expect(store.objects.has(doc.objectKey)).toBe(true);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner } }))
      .deletionStartedAt,
  ).not.toBeNull();
  expect(
    (await db.employmentDocument.findUniqueOrThrow({ where: { id: doc.id } }))
      .storagePurgedAt,
  ).toBeNull();
  expect(await isAuthSessionActive(session.id, owner)).toBe(true);
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
  expect(await service().remove(owner, input)).toEqual({ status: "deleted" });
  expect(await isAuthSessionActive(session.id, owner)).toBe(false);
});
it("removes failed and historically deleted objects, checkpoints partial cleanup, and resumes in bounded batches", async () => {
  for (const status of ["ready", "failed", "deleted", "ready"] as const)
    await addDoc(owner, job, status);
  const foreign = await addDoc(other, otherJob);
  expect(await service().remove(owner, input)).toEqual({ status: "pending" });
  expect(
    await db.employmentDocument.count({
      where: { userId: owner, storagePurgedAt: { not: null } },
    }),
  ).toBe(3);
  const removals = store.removals;
  expect(await service().remove(owner, input)).toEqual({ status: "deleted" });
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
  await expect(
    service(guarded as unknown as typeof db).remove(owner, input),
  ).rejects.toThrow();
  expect(store.objects.size).toBe(0);
  expect(
    (await db.employmentDocument.findUniqueOrThrow({ where: { id: doc.id } }))
      .storagePurgedAt,
  ).toBeNull();
  expect(await service().remove(owner, input)).toEqual({ status: "deleted" });
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
  await expect(
    service(guarded as unknown as typeof db).remove(owner, input),
  ).rejects.toThrow("transaction failure");
  expect(await db.employment.count({ where: { userId: owner } })).toBe(1);
  expect(await db.employmentDocument.count({ where: { userId: owner } })).toBe(
    1,
  );
  expect(await isAuthSessionActive(session.id, owner)).toBe(true);
  const count = store.removals;
  expect(await service().remove(owner, input)).toEqual({ status: "deleted" });
  expect(store.removals).toBe(count);
});
it("rejects cross-user password use and unauthenticated or repeated stale calls", async () => {
  await expect(service().remove(other, input)).rejects.toMatchObject({
    status: 403,
  });
  await expect(service().remove("", input)).rejects.toMatchObject({
    status: 401,
  });
  expect(await service().remove(owner, input)).toEqual({ status: "deleted" });
  await expect(service().remove(owner, input)).rejects.toMatchObject({
    status: 403,
  });
  expect(await db.user.findUnique({ where: { id: other } })).not.toBeNull();
});
it("rejects unfinished upload reservations before irreversible cleanup", async () => {
  await addDoc(owner, job, "uploaded");
  await expect(service().remove(owner, input)).rejects.toMatchObject({
    status: 409,
  });
  expect(store.removals).toBe(0);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: owner } }))
      .deletionStartedAt,
  ).toBeNull();
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
  const deleting = service()
    .remove(owner, input)
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  finish();
  await uploading;
  const outcome = await deleting;
  if ("error" in outcome) {
    expect(outcome.error.status).toBe(409);
    await service().remove(owner, input);
  }
  expect(store.objects.size).toBe(0);
  expect(await db.user.findUnique({ where: { id: owner } })).toBeNull();
});
it("fails closed when password throttling is exhausted or unavailable", async () => {
  await addDoc();
  allow.mockResolvedValueOnce(false);
  await expect(service().remove(owner, input)).rejects.toMatchObject({
    status: 429,
  });
  allow.mockRejectedValueOnce(new Error("cache unavailable"));
  await expect(service().remove(owner, input)).rejects.toThrow();
  expect(store.removals).toBe(0);
});
