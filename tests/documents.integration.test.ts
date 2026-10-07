import { beforeEach, afterEach, afterAll, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getDb } from "@/server/db/client";
import { documentService } from "@/modules/documents/service";
import { FakeStorage } from "./helpers/fake-storage";
const db = getDb();
const pdf = readFileSync("tests/fixtures/document.pdf");
let a: string;
let b: string;
let job: string;
let otherJob: string;
let store: FakeStorage;
const service = () => documentService(db, () => store);
const upload = () =>
  service().upload(
    a,
    { employmentId: job, documentType: "employment_contract" },
    pdf,
    "contract.pdf",
    "application/pdf",
    10485760,
  );
beforeEach(async () => {
  a = (await db.user.create({ data: {} })).id;
  b = (await db.user.create({ data: {} })).id;
  job = (
    await db.employment.create({
      data: {
        userId: a,
        employerName: "Fixture",
        roleTitle: "Role",
        startDate: new Date("2024-01-01"),
      },
    })
  ).id;
  otherJob = (
    await db.employment.create({
      data: {
        userId: b,
        employerName: "Other",
        roleTitle: "Role",
        startDate: new Date("2024-01-01"),
      },
    })
  ).id;
  store = new FakeStorage();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.auditEvent.deleteMany({ where: { userId: { in: [a, b] } } });
  await db.employmentDocument.deleteMany({ where: { userId: { in: [a, b] } } });
  await db.user.deleteMany({ where: { id: { in: [a, b] } } });
});
afterAll(async () => {
  await db.$disconnect();
});
it("persists ready metadata, correct bytes and a minimal upload audit", async () => {
  const doc = await upload();
  expect(doc.status).toBe("ready");
  expect(doc).not.toHaveProperty("objectKey");
  const row = await db.employmentDocument.findUniqueOrThrow({
    where: { id: doc.id },
  });
  expect(store.objects.get(row.objectKey)).toEqual(pdf);
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { documentId: doc.id },
  });
  expect(audit.action).toBe("document_uploaded");
  expect(audit).not.toHaveProperty("filename");
  expect(await service().list(a, job)).toHaveLength(1);
});
it("rejects upload/read/list/sign/delete across workers before storage access", async () => {
  await expect(
    service().upload(
      a,
      { employmentId: otherJob },
      pdf,
      "x.pdf",
      "application/pdf",
      10000,
    ),
  ).rejects.toMatchObject({ status: 404 });
  expect(store.writes).toBe(0);
  const doc = await upload();
  expect(await service().list(b)).toEqual([]);
  await expect(service().list(b, job)).rejects.toMatchObject({ status: 404 });
  for (const action of [
    () => service().detail(b, doc.id),
    () => service().access(b, doc.id),
    () => service().remove(b, doc.id),
  ])
    await expect(action()).rejects.toMatchObject({ status: 404 });
  expect(store.signs).toBe(0);
  expect(store.removals).toBe(0);
  await expect(service().list("")).rejects.toMatchObject({ status: 401 });
});
it("issues audited expiring access, then deletes and denies future access", async () => {
  const doc = await upload();
  expect(await service().access(a, doc.id)).toMatchObject({ expiresIn: 60 });
  await service().remove(a, doc.id);
  expect(store.objects.size).toBe(0);
  expect(await service().list(a)).toEqual([]);
  await expect(service().access(a, doc.id)).rejects.toMatchObject({
    status: 404,
  });
  expect(
    (
      await db.auditEvent.findMany({
        where: { documentId: doc.id },
        orderBy: { createdAt: "asc" },
      })
    ).map((event) => event.action),
  ).toEqual([
    "document_uploaded",
    "document_access_issued",
    "document_deleted",
  ]);
});
it("does not upload an object when metadata reservation fails", async () => {
  vi.spyOn(db.employmentDocument, "create").mockRejectedValueOnce(
    new Error("db offline"),
  );
  await expect(upload()).rejects.toThrow();
  expect(store.writes).toBe(0);
});
it("cleans up ambiguous failed puts and retains a failed record", async () => {
  store.failPut = true;
  await expect(upload()).rejects.toThrow("Upload failed");
  expect(store.objects.size).toBe(0);
  const [doc] = await service().list(a);
  expect(doc?.status).toBe("failed");
  await expect(service().access(a, doc!.id)).rejects.toMatchObject({
    status: 409,
  });
});
it("retains the object key when both upload and compensation fail, then retries deletion", async () => {
  store.failPut = store.failDelete = true;
  await expect(upload()).rejects.toThrow();
  expect(store.objects.size).toBe(1);
  const [doc] = await service().list(a);
  store.failDelete = false;
  await service().remove(a, doc!.id);
  expect(store.objects.size).toBe(0);
});
it("retains an inaccessible reservation if finalize/audit fails after upload", async () => {
  vi.spyOn(db, "$transaction").mockRejectedValueOnce(
    new Error("commit failed"),
  );
  await expect(upload()).rejects.toThrow();
  const [doc] = await service().list(a);
  expect(doc?.status).toBe("uploaded");
  expect(store.objects.size).toBe(1);
  await expect(service().remove(a, doc!.id)).rejects.toMatchObject({
    status: 409,
  });
  await db.employmentDocument.update({
    where: { id: doc!.id },
    data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
  });
  await service().remove(a, doc!.id);
  expect(store.objects.size).toBe(0);
});
it("blocks viewing during failed deletion and supports idempotent object cleanup", async () => {
  const doc = await upload();
  store.failDelete = true;
  await expect(service().remove(a, doc.id)).rejects.toThrow();
  expect((await service().detail(a, doc.id)).status).toBe("deleting");
  await expect(service().access(a, doc.id)).rejects.toMatchObject({
    status: 409,
  });
  store.failDelete = false;
  store.objects.clear();
  await service().remove(a, doc.id);
  expect(await service().list(a)).toEqual([]);
});
it("retries after object deletion succeeds but the final database transaction fails", async () => {
  const doc = await upload();
  vi.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("db offline"));
  await expect(service().remove(a, doc.id)).rejects.toThrow();
  expect(store.objects.size).toBe(0);
  expect((await service().detail(a, doc.id)).status).toBe("deleting");
  await service().remove(a, doc.id);
  expect(
    await db.auditEvent.count({
      where: { documentId: doc.id, action: "document_deleted" },
    }),
  ).toBe(1);
});
it("does not return access if signing fails", async () => {
  const doc = await upload();
  store.failSign = true;
  await expect(service().access(a, doc.id)).rejects.toThrow();
  expect(
    await db.auditEvent.count({
      where: { documentId: doc.id, action: "document_access_issued" },
    }),
  ).toBe(0);
});
it("enforces employment-owner consistency in PostgreSQL", async () => {
  const doc = await upload();
  await expect(
    db.employmentDocument.update({
      where: { id: doc.id },
      data: { employmentId: otherJob },
    }),
  ).rejects.toThrow();
});

it("does not return a signed URL when its audit write fails", async () => {
  const doc = await upload();
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
    documentService(guarded as unknown as typeof db, () => store).access(
      a,
      doc.id,
    ),
  ).rejects.toThrow("audit unavailable");
  expect(store.signs).toBe(1);
  expect(
    await db.auditEvent.count({
      where: { documentId: doc.id, action: "document_access_issued" },
    }),
  ).toBe(0);
});
