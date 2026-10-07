import { beforeEach, afterEach, afterAll, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getDb } from "@/server/db/client";
import { documentService } from "@/modules/documents/service";
import { extractionService } from "@/modules/extractions/service";
import { FakeStorage } from "./helpers/fake-storage";
import type { DocumentAI } from "@/server/ai/client";
const db = getDb();
const fixture = JSON.parse(
  readFileSync("tests/fixtures/intelligence/employment_contract.json", "utf8"),
);
const pdf = readFileSync("tests/fixtures/intelligence/employment_contract.pdf");
let userId: string;
let otherId: string;
let documentId: string;
let job: string;
let store: FakeStorage;
let ai: DocumentAI;
const service = () =>
  extractionService(db, {
    storage: () => store,
    ai: () => ai,
    allow: async () => true,
  });
beforeEach(async () => {
  userId = (await db.user.create({ data: {} })).id;
  otherId = (await db.user.create({ data: {} })).id;
  job = (
    await db.employment.create({
      data: {
        userId,
        employerName: "Original employer",
        roleTitle: "Original role",
        startDate: new Date("2024-01-01"),
      },
    })
  ).id;
  store = new FakeStorage();
  documentId = (
    await documentService(db, () => store).upload(
      userId,
      { employmentId: job },
      pdf,
      "contract.pdf",
      "application/pdf",
      10485760,
    )
  ).id;
  ai = {
    model: "fixture-model",
    complete: vi.fn(async (task) =>
      JSON.stringify(
        task.system.includes("Classify only")
          ? fixture.classification
          : fixture.fields,
      ),
    ),
  };
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.auditEvent.deleteMany({
    where: { userId: { in: [userId, otherId] } },
  });
  await db.employmentDocument.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});
afterAll(async () => {
  await db.$disconnect();
});
it("persists only proposed grounded fields with source/model/version metadata, without changing employment", async () => {
  const { extraction } = await service().start(userId, documentId, {
    mode: "ai",
  });
  expect(extraction).toMatchObject({
    status: "ready",
    documentType: "employment_contract",
    model: "fixture-model",
    sourceKind: "pdf_text",
    promptVersion: "evidence-v2",
    schemaVersion: "fields-v2",
  });
  expect(
    extraction!.fields.every(
      (field) => field.value === null && field.reviewState === "proposed",
    ),
  ).toBe(true);
  expect(await db.employment.findUnique({ where: { id: job } })).toMatchObject({
    employerName: "Original employer",
  });
  expect(
    await db.auditEvent.count({
      where: { documentId, action: "extraction_completed" },
    }),
  ).toBe(1);
});
it("confirms, corrects, rejects and marks unknown with immutable proposals and correction history", async () => {
  const run = (
    await service().start(userId, documentId, {
      mode: "ai",
      text: fixture.text,
    })
  ).extraction!;
  const field = run.fields.find((field) => field.key === "employer")!;
  for (const [version, action, value] of [
    [0, "confirm", undefined],
    [1, "correct", "Corrected employer"],
    [2, "reject", undefined],
    [3, "unknown", undefined],
  ] as const) {
    const result = await service().review(userId, documentId, {
      fieldId: field.id,
      version,
      action,
      ...(value ? { value } : {}),
    });
    expect(
      result.extraction!.fields.find((item) => item.id === field.id)!.revisions,
    ).toHaveLength(version + 1);
  }
  const saved = await db.extractedField.findUniqueOrThrow({
    where: { id: field.id },
  });
  expect(saved).toMatchObject({
    proposedValue: "Harbour Workshop Ltd",
    value: null,
    reviewState: "unknown",
    version: 4,
  });
  await expect(
    service().review(userId, documentId, {
      fieldId: field.id,
      version: 0,
      action: "confirm",
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it("blocks another worker at read/start/review and run ID boundaries, before inference", async () => {
  await expect(service().read(otherId, documentId)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    service().start(otherId, documentId, { mode: "ai" }),
  ).rejects.toMatchObject({ status: 404 });
  expect(ai.complete).not.toHaveBeenCalled();
  const run = (
    await service().start(userId, documentId, {
      mode: "manual",
      type: "payslip",
    })
  ).extraction!;
  await expect(
    service().review(otherId, documentId, {
      fieldId: run.fields[0]!.id,
      version: 0,
      action: "unknown",
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    service().read(userId, documentId, "foreign"),
  ).rejects.toMatchObject({ status: 404 });
  await expect(service().read("", documentId)).rejects.toMatchObject({
    status: 401,
  });
});
it("manual entry works without AI/storage and missing proposals cannot be confirmed", async () => {
  const offline = extractionService(db, {
    ai: () => {
      throw new Error();
    },
    storage: () => {
      throw new Error();
    },
    allow: async () => true,
  });
  const run = (
    await offline.start(userId, documentId, {
      mode: "manual",
      type: "termination_letter",
    })
  ).extraction!;
  expect(run.sourceKind).toBe("manual");
  const field = run.fields[0]!;
  await expect(
    offline.review(userId, documentId, {
      fieldId: field.id,
      version: 0,
      action: "confirm",
    }),
  ).rejects.toMatchObject({ status: 422 });
  await offline.review(userId, documentId, {
    fieldId: field.id,
    version: 0,
    action: "correct",
    value: "31 October 2026",
  });
  expect(
    (await offline.read(userId, documentId)).extraction!.fields[0]!.reviewState,
  ).toBe("corrected");
});
it("retains earlier reviewed attempts on retry", async () => {
  const first = (
    await service().start(userId, documentId, {
      mode: "manual",
      type: "payslip",
    })
  ).extraction!;
  await service().review(userId, documentId, {
    fieldId: first.fields[0]!.id,
    version: 0,
    action: "correct",
    value: "NGN 100",
  });
  await service().start(userId, documentId, { mode: "ai", text: fixture.text });
  expect(
    (await service().read(userId, documentId, first.id)).extraction!.fields[0]!
      .value,
  ).toBe("NGN 100");
});
it("handles unavailable inference and malformed output without storing raw responses", async () => {
  ai.complete = async () => {
    throw new Error("SECRET provider details");
  };
  const failed = (
    await service().start(userId, documentId, {
      mode: "ai",
      text: fixture.text,
    })
  ).extraction!;
  expect(failed).toMatchObject({
    status: "failed",
    errorCode: "unavailable",
    fields: [],
  });
  expect(JSON.stringify(failed)).not.toContain("SECRET");
  ai.complete = async () => "malformed";
  expect(
    (
      await service().start(userId, documentId, {
        mode: "ai",
        text: fixture.text,
      })
    ).extraction,
  ).toMatchObject({ status: "failed", errorCode: "malformed", fields: [] });
});
it("low-confidence classification pauses before type-specific inference", async () => {
  ai.complete = vi.fn(async () =>
    JSON.stringify({ ...fixture.classification, confidence: "low" }),
  );
  const run = (
    await service().start(userId, documentId, {
      mode: "ai",
      text: fixture.text,
    })
  ).extraction!;
  expect(ai.complete).toHaveBeenCalledTimes(1);
  expect(run.fields).toHaveLength(1);
  expect(run.fields[0]!.reviewState).toBe("proposed");
});
it("guards concurrent attempts and permits stale attempt recovery", async () => {
  await db.documentExtraction.create({
    data: {
      userId,
      documentId,
      model: "fixture",
      sourceKind: "pdf_text",
      promptVersion: "v1",
      schemaVersion: "v1",
    },
  });
  await expect(
    service().start(userId, documentId, { mode: "manual", type: "payslip" }),
  ).rejects.toMatchObject({ status: 409 });
  await db.documentExtraction.updateMany({
    where: { documentId },
    data: { createdAt: new Date(Date.now() - 121000) },
  });
  await service().start(userId, documentId, {
    mode: "manual",
    type: "payslip",
  });
  expect(
    await db.documentExtraction.count({
      where: { documentId, errorCode: "interrupted" },
    }),
  ).toBe(1);
});
it("deleting a document removes derived fields/history and prevents late inference resurrection", async () => {
  const run = (
    await service().start(userId, documentId, {
      mode: "manual",
      type: "payslip",
    })
  ).extraction!;
  await service().review(userId, documentId, {
    fieldId: run.fields[0]!.id,
    version: 0,
    action: "unknown",
  });
  ai.complete = async () => {
    await documentService(db, () => store).remove(userId, documentId);
    return JSON.stringify(fixture.classification);
  };
  await expect(
    service().start(userId, documentId, { mode: "ai", text: fixture.text }),
  ).rejects.toThrow();
  expect(await db.documentExtraction.count({ where: { documentId } })).toBe(0);
  expect(
    await db.extractionFieldRevision.count({
      where: { fieldId: run.fields[0]!.id },
    }),
  ).toBe(0);
});
it("fails closed on throttling and rolls back review when auditing fails", async () => {
  await expect(
    extractionService(db, { allow: async () => false }).start(
      userId,
      documentId,
      { mode: "ai" },
    ),
  ).rejects.toMatchObject({ status: 429 });
  const run = (
    await service().start(userId, documentId, {
      mode: "manual",
      type: "payslip",
    })
  ).extraction!;
  const guarded = db.$extends({
    query: {
      auditEvent: {
        async create() {
          throw new Error("audit offline");
        },
      },
    },
  });
  await expect(
    extractionService(guarded as unknown as typeof db).review(
      userId,
      documentId,
      {
        fieldId: run.fields[0]!.id,
        version: 0,
        action: "correct",
        value: "100",
      },
    ),
  ).rejects.toThrow();
  expect(
    await db.extractedField.findUnique({ where: { id: run.fields[0]!.id } }),
  ).toMatchObject({ reviewState: "proposed", version: 0, value: null });
});
