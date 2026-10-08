import { beforeEach, afterEach, afterAll, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getDb } from "@/server/db/client";
import { documentService } from "@/modules/documents/service";
import { extractionService } from "@/modules/extractions/service";
import {
  persistAttempt,
  reapExpiredAttempts,
} from "@/modules/extractions/persistence";
import { FakeStorage } from "./helpers/fake-storage";
import { InferenceError, type DocumentAI } from "@/server/ai/client";
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
    promptVersion: "evidence-v5",
    schemaVersion: "fields-v5",
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
  ).toMatchObject({ status: "ready", documentType: "other" });
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

it("persists timeout fallback and permits manual entry without another inference call", async () => {
  ai.complete = vi.fn().mockRejectedValue(new InferenceError("timeout"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const failed = (
    await service().start(userId, documentId, {
      mode: "ai",
      type: "employment_contract",
      text: fixture.text,
    })
  ).extraction!;
  expect(failed).toMatchObject({
    status: "failed",
    errorCode: "timeout",
    fields: [],
  });
  expect(log).toHaveBeenCalledWith(
    "extraction_inference_failed",
    "extraction",
    "timeout",
    null,
  );
  const manual = (
    await service().start(userId, documentId, {
      mode: "manual",
      type: "employment_contract",
    })
  ).extraction!;
  expect(manual.status).toBe("ready");
  expect(
    manual.fields.every(
      (f) =>
        f.value === null &&
        f.proposedValue === null &&
        f.reviewState === "proposed",
    ),
  ).toBe(true);
  expect(ai.complete).toHaveBeenCalledTimes(1);
});

it("persists sparse 3B responses only as proposals and retains missing review fields", async () => {
  ai.complete = vi.fn().mockResolvedValue(
    JSON.stringify({
      fields: [
        {
          key: "employer",
          value: "Harbour Workshop Ltd",
          evidence: "Employer: Harbour Workshop Ltd",
        },
      ],
    }),
  );
  const run = (
    await service().start(userId, documentId, {
      mode: "ai",
      type: "employment_contract",
      text: fixture.text,
    })
  ).extraction!;
  expect(run.status).toBe("ready");
  expect(run.fields).toHaveLength(15);
  expect(run.fields.find((f) => f.key === "employer")).toMatchObject({
    proposedValue: "Harbour Workshop Ltd",
    value: null,
    confidence: "needs_review",
    reviewState: "proposed",
  });
  expect(run.fields.find((f) => f.key === "salary")).toMatchObject({
    proposedValue: null,
    value: null,
    reviewState: "proposed",
  });
  expect(ai.complete).toHaveBeenCalledTimes(1);
});

it("persists valid partial proposals with an explicit indicator and no trusted values", async () => {
  ai.complete = async () =>
    JSON.stringify({
      fields: [
        {
          key: "employer",
          value: "Harbour Workshop Ltd",
          evidence: "Employer: Harbour Workshop Ltd",
        },
        { key: "role", value: 42, evidence: "invented" },
        { key: "salary", value: "100" },
        { key: "legal_entitlement", value: "100", evidence: "100" },
      ],
    });
  const { extraction } = await service().start(userId, documentId, {
    mode: "ai",
    type: "employment_contract",
    text: fixture.text,
  });
  expect(extraction).toMatchObject({ status: "ready", errorCode: "partial" });
  expect(
    extraction!.fields.filter(
      (f) => f.proposedValue && f.key !== "document_type",
    ),
  ).toHaveLength(1);
  expect(
    extraction!.fields.every(
      (f) => f.reviewState === "proposed" && f.value === null,
    ),
  ).toBe(true);
});

it("fails safely with zero grounded fields while keeping manual entry available", async () => {
  ai.complete = async () =>
    JSON.stringify({
      fields: [{ key: "employer", value: "invented", evidence: "invented" }],
    });
  const failed = await service().start(userId, documentId, {
    mode: "ai",
    type: "employment_contract",
    text: fixture.text,
  });
  expect(failed.extraction).toMatchObject({
    status: "failed",
    errorCode: "malformed",
    fields: [],
  });
  expect(
    (
      await service().start(userId, documentId, {
        mode: "manual",
        type: "employment_contract",
      })
    ).extraction?.status,
  ).toBe("ready");
});

it("recovers a result P2028 using a fresh atomic failure operation and retains the original attempt", async () => {
  // Real Prisma expiration, at a shortened test-only budget. Production defaults
  // are unchanged; result/failure persistence no longer uses interactive transactions.
  let expired: unknown;
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_sleep(0.08)`;
        await tx.documentExtraction.count();
      },
      { timeout: 30 },
    );
  } catch (error) {
    expired = error;
  }
  expect(expired).toMatchObject({ code: "P2028" });
  ai.complete = async () => {
    vi.spyOn(db, "$queryRaw").mockRejectedValueOnce(expired);
    return JSON.stringify(fixture.fields);
  };
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await service().start(userId, documentId, {
    mode: "ai",
    type: "employment_contract",
    text: fixture.text,
  });
  expect(result.extraction).toMatchObject({
    status: "failed",
    errorCode: "persistence",
    fields: [],
  });

  expect(log).toHaveBeenCalledWith(
    "extraction_pipeline_failed",
    "result_persistence",
    "P2028",
  );
  expect(await db.documentExtraction.count({ where: { documentId } })).toBe(1);
  expect(
    await db.auditEvent.count({
      where: { documentId, action: "extraction_failed" },
    }),
  ).toBe(1);
});

it("reconciles an expired run after both result and failure persistence are unavailable", async () => {
  const fault = Object.assign(new Error("transaction expired"), {
    code: "P2028",
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  ai.complete = async () => {
    vi.spyOn(db, "$queryRaw")
      .mockRejectedValueOnce(fault)
      .mockRejectedValueOnce(fault);
    return JSON.stringify(fixture.fields);
  };
  await expect(
    service().start(userId, documentId, {
      mode: "ai",
      type: "employment_contract",
      text: fixture.text,
    }),
  ).rejects.toMatchObject({ code: "P2028" });
  vi.restoreAllMocks();
  await db.documentExtraction.updateMany({
    where: { documentId },
    data: { createdAt: new Date(Date.now() - 121000) },
  });
  const read = await service().read(userId, documentId);
  expect(read.extraction).toMatchObject({
    status: "failed",
    errorCode: "interrupted",
    fields: [],
  });
  await service().read(userId, documentId);
  expect(
    await db.auditEvent.count({
      where: { documentId, action: "extraction_failed" },
    }),
  ).toBe(1);
});

it("does not hold a database transaction or document lock across inference, and blocks concurrent starts", async () => {
  ai.complete = async () => {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "EmploymentDocument" WHERE "id" = ${documentId} FOR UPDATE NOWAIT`;
    });
    await expect(
      service().start(userId, documentId, { mode: "manual", type: "payslip" }),
    ).rejects.toMatchObject({ status: 409 });
    return JSON.stringify(fixture.fields);
  };
  const result = await service().start(userId, documentId, {
    mode: "ai",
    type: "employment_contract",
    text: fixture.text,
  });
  expect(result.extraction?.status).toBe("ready");
});

it("marks an expired completion failed and never overwrites a newer attempt", async () => {
  let newer: string | undefined;
  ai.complete = async () => {
    await db.documentExtraction.updateMany({
      where: { documentId, status: "processing" },
      data: { createdAt: new Date(Date.now() - 121000) },
    });
    newer = (
      await service().start(userId, documentId, {
        mode: "manual",
        type: "payslip",
      })
    ).extraction!.id;
    return JSON.stringify(fixture.fields);
  };
  await expect(
    service().start(userId, documentId, {
      mode: "ai",
      type: "employment_contract",
      text: fixture.text,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.documentExtraction.findUnique({ where: { id: newer } }),
  ).toMatchObject({ status: "ready", documentType: "payslip" });
  expect(
    await db.documentExtraction.count({
      where: { documentId, status: "processing" },
    }),
  ).toBe(0);
});

it("expires a late completion even without a newer attempt", async () => {
  ai.complete = async () => {
    await db.documentExtraction.updateMany({
      where: { documentId },
      data: { createdAt: new Date(Date.now() - 121000) },
    });
    return JSON.stringify(fixture.fields);
  };
  await expect(
    service().start(userId, documentId, {
      mode: "ai",
      type: "employment_contract",
      text: fixture.text,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await service().read(userId, documentId)).extraction).toMatchObject({
    status: "failed",
    errorCode: "interrupted",
    fields: [],
  });
});

it("rolls back all result writes on a database constraint failure before fresh failure persistence", async () => {
  const run = await db.documentExtraction.create({
    data: {
      userId,
      documentId,
      model: "fixture",
      sourceKind: "pdf_text",
      promptVersion: "test",
      schemaVersion: "test",
    },
  });
  const proposal = {
    key: "employer",
    value: "Acme",
    evidence: "Acme",
    confidence: "needs_review" as const,
  };
  await expect(
    persistAttempt(db, userId, documentId, {
      runId: run.id,
      model: "fixture",
      sourceHash: null,
      result: {
        type: "payslip",
        proposals: [proposal, proposal],
        partial: false,
      },
    }),
  ).rejects.toThrow();
  expect(
    await db.documentExtraction.findUnique({ where: { id: run.id } }),
  ).toMatchObject({ status: "processing" });
  expect(
    await db.extractedField.count({ where: { extractionId: run.id } }),
  ).toBe(0);
  expect(
    await db.auditEvent.count({
      where: { documentId, action: "extraction_completed" },
    }),
  ).toBe(0);
  await persistAttempt(db, userId, documentId, {
    runId: run.id,
    model: "fixture",
    sourceHash: null,
    errorCode: "persistence",
  });
  expect((await service().read(userId, documentId)).extraction).toMatchObject({
    status: "failed",
    errorCode: "persistence",
    fields: [],
  });
  expect(
    await db.auditEvent.count({
      where: { documentId, action: "extraction_failed" },
    }),
  ).toBe(1);
});

it("worker expiry reconciles abandoned attempts once without user visits", async () => {
  const now = new Date();
  const common = {
    userId,
    documentId,
    model: "fixture",
    sourceKind: "pdf_text",
    promptVersion: "test",
    schemaVersion: "test",
  };
  const old = await db.documentExtraction.create({
    data: { ...common, createdAt: new Date(now.getTime() - 121000) },
  });
  const active = await db.documentExtraction.create({ data: common });
  expect(await reapExpiredAttempts(db, now)).toBe(false);
  expect(
    await db.documentExtraction.findUnique({ where: { id: old.id } }),
  ).toMatchObject({ status: "failed", errorCode: "interrupted" });
  expect(
    await db.documentExtraction.findUnique({ where: { id: active.id } }),
  ).toMatchObject({ status: "processing" });
  await reapExpiredAttempts(db, now);
  expect(
    await db.auditEvent.count({
      where: { documentId, action: "extraction_failed" },
    }),
  ).toBe(1);
});

it("checks the lease after waiting for the document lock", async () => {
  const run = await db.documentExtraction.create({
    data: {
      userId,
      documentId,
      model: "fixture",
      sourceKind: "pdf_text",
      promptVersion: "test",
      schemaVersion: "test",
      createdAt: new Date(Date.now() - 119700),
    },
  });
  let locked!: () => void;
  let release!: () => void;
  const acquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const blocker = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "EmploymentDocument" WHERE "id" = ${documentId} FOR UPDATE`;
    locked();
    await hold;
  });
  try {
    await acquired;
    const saving = persistAttempt(db, userId, documentId, {
      runId: run.id,
      model: "fixture",
      sourceHash: null,
      result: { type: "payslip", proposals: [], partial: false },
    });
    // Start the query while the lease is still live, then release after expiry.
    const pending = Promise.resolve(saving);
    await new Promise((resolve) => setTimeout(resolve, 500));
    release();
    expect(await pending).toEqual([{ id: run.id, status: "failed" }]);
    expect(
      await db.documentExtraction.findUnique({ where: { id: run.id } }),
    ).toMatchObject({ errorCode: "interrupted" });
  } finally {
    release();
    await blocker;
  }
});

it("reserves only one of two simultaneous AI starts", async () => {
  let release!: () => void;
  let rejected!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const conflict = new Promise<void>((resolve) => {
    rejected = resolve;
  });
  ai.complete = vi.fn(async () => {
    await hold;
    return JSON.stringify(fixture.fields);
  });
  const start = () =>
    service()
      .start(userId, documentId, {
        mode: "ai",
        type: "employment_contract",
        text: fixture.text,
      })
      .catch((error) => {
        rejected();
        throw error;
      });
  const results = Promise.allSettled([start(), start()]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      conflict,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Concurrent reservation did not reject")),
          2000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    release();
  }
  const settled = await results;
  expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(settled.find((r) => r.status === "rejected")).toMatchObject({
    reason: { status: 409 },
  });
  expect(ai.complete).toHaveBeenCalledTimes(1);
  expect(await db.documentExtraction.count({ where: { documentId } })).toBe(1);
});

it.each([
  [
    {
      KEY: "Employer Name",
      VALUE: "Harbour Workshop Ltd",
      EVIDENCE: "Employer: Harbour Workshop Ltd",
    },
    { key: "salary" },
  ],
  {
    fields: {
      key: "employer",
      value: "Harbour Workshop Ltd",
      evidence: "Employer: Harbour Workshop Ltd",
    },
  },
  {
    key: "EMPLOYER",
    value: "Harbour Workshop Ltd",
    evidence: "Employer: Harbour Workshop Ltd",
  },
])("persists salvaged output as partial proposals only: %j", async (output) => {
  ai.complete = vi
    .fn()
    .mockResolvedValue(
      `Here is the result:\n\`\`\`json\n${JSON.stringify(output)}\n\`\`\`\nReview it.`,
    );
  const run = (
    await service().start(userId, documentId, {
      mode: "ai",
      type: "employment_contract",
      text: fixture.text,
    })
  ).extraction!;
  expect(run).toMatchObject({ status: "ready", errorCode: "partial" });
  expect(run.fields.find((f) => f.key === "employer")).toMatchObject({
    proposedValue: "Harbour Workshop Ltd",
    value: null,
    confidence: "needs_review",
    reviewState: "proposed",
  });
  expect(ai.complete).toHaveBeenCalledTimes(1);
});
it("uses the same prompt only on explicit retry and preserves the failed attempt", async () => {
  const complete = vi
    .fn()
    .mockResolvedValueOnce("not JSON")
    .mockResolvedValueOnce(
      JSON.stringify({
        fields: [
          {
            key: "employer",
            value: "Harbour Workshop Ltd",
            evidence: "Employer: Harbour Workshop Ltd",
          },
        ],
      }),
    );
  ai.complete = complete;
  const input = { mode: "ai", type: "employment_contract", text: fixture.text };
  const first = (await service().start(userId, documentId, input)).extraction!;
  expect(first).toMatchObject({
    status: "failed",
    errorCode: "malformed",
    fields: [],
  });
  expect(complete).toHaveBeenCalledTimes(1);
  const second = await service().start(userId, documentId, input);
  expect(second.extraction).toMatchObject({
    status: "ready",
    errorCode: "partial",
  });
  expect(complete).toHaveBeenCalledTimes(2);
  expect(complete.mock.calls[0]).toEqual(complete.mock.calls[1]);
  expect(second.attempts).toHaveLength(2);
  expect(
    (await service().read(userId, documentId, first.id)).extraction,
  ).toMatchObject({ status: "failed", errorCode: "malformed", fields: [] });
});
