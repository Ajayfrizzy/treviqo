import { beforeEach, afterEach, afterAll, expect, it } from "vitest";
import type { DocumentType } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { financeService } from "@/modules/finance/service";
import { exitService } from "@/modules/exits/service";
import { updateEmployment } from "@/modules/employments/service";
import { exitSchema } from "@/modules/exits/shared";
const db = getDb();
const service = financeService(db);
let a: string, b: string, job: string, id: string;
async function source(
  type: DocumentType,
  values: Record<string, string>,
  employmentId = job,
  userId = a,
) {
  const doc = await db.employmentDocument.create({
    data: {
      userId,
      employmentId,
      documentType: type,
      originalFilename: "fixture.pdf",
      sanitizedFilename: "fixture.pdf",
      objectKey: crypto.randomUUID(),
      mimeType: "application/pdf",
      fileSize: 1,
      checksum: "fixture",
      status: "ready",
    },
  });
  const run = await db.documentExtraction.create({
    data: {
      userId,
      documentId: doc.id,
      documentType: type,
      status: "ready",
      sourceKind: "manual",
      model: "manual",
      promptVersion: "evidence-v2",
      schemaVersion: "fields-v2",
      fields: {
        create: Object.entries(values).map(([key, value]) => ({
          key,
          value,
          proposedValue: value,
          reviewState: "confirmed",
          confidence: "high",
          version: 1,
        })),
      },
    },
    include: { fields: true },
  });
  return {
    doc,
    run,
    field: run.fields.find((field) => field.key === Object.keys(values)[0])!,
  };
}
async function settlement() {
  const expected = await source("payslip", { gross_pay: "NGN 250000" });
  const actual = await source("final_settlement", {
    final_salary: "NGN 250000",
  });
  return {
    expected,
    actual,
    item: {
      category: "final_salary",
      label: "October salary",
      documentId: actual.doc.id,
      expectedFieldId: expected.field.id,
      expectedFieldVersion: 1,
      actualFieldId: actual.field.id,
      actualFieldVersion: 1,
      expectedPeriod: "2026-10",
      actualPeriod: "2026-10",
    },
  };
}
async function pension() {
  const statement = await source("pension_statement", {
    statement_start: "2026-10",
    statement_end: "2026-11",
    entries_complete: "yes",
    contribution_1_employer: "Fixture",
    contribution_1_period: "2026-10",
    contribution_1_date: "2026-11-05",
    contribution_1_employee_amount: "NGN 20000",
    contribution_1_employer_amount: "NGN 25000",
  });
  await service.command(a, id, { action: "pension_start" });
  const data = await service.command(a, id, {
    action: "pension_save",
    input: {
      version: 0,
      targetPeriod: "2026-10",
      statementRunId: statement.run.id,
      expectedFieldId: null,
      expectedFieldVersion: null,
      followUpDate: "2026-12-01",
    },
  });
  return { statement, data };
}
beforeEach(async () => {
  a = (await db.user.create({ data: {} })).id;
  b = (await db.user.create({ data: {} })).id;
  job = (
    await db.employment.create({
      data: {
        userId: a,
        employerName: "Fixture",
        roleTitle: "Worker",
        startDate: new Date("2024-01-01"),
      },
    })
  ).id;
  id = (
    await exitService(db).create(a, {
      employmentId: job,
      answers: exitSchema.parse({
        exitType: "resignation",
        lastWorkingDate: "2026-10-31",
        pension: "yes",
      }),
    })
  ).id;
});
afterEach(async () => {
  await db.auditEvent.deleteMany({ where: { userId: { in: [a, b] } } });
  await db.employmentDocument.deleteMany({ where: { userId: { in: [a, b] } } });
  await db.user.deleteMany({ where: { id: { in: [a, b] } } });
});
afterAll(() => db.$disconnect());
it("saves, compares, edits and removes owner items with audits and optimistic conflicts", async () => {
  const { item } = await settlement();
  const saved = await service.command(a, id, {
    action: "settlement_save",
    item,
  });
  const row = saved.items[0]!;
  expect(row.result.state).toBe("consistent");
  await service.command(a, id, {
    action: "settlement_save",
    item: { ...item, id: row.id, version: 0, label: "Updated" },
  });
  await expect(
    service.command(a, id, {
      action: "settlement_save",
      item: { ...item, id: row.id, version: 0 },
    }),
  ).rejects.toMatchObject({ status: 409 });
  await service.command(a, id, {
    action: "settlement_remove",
    id: row.id,
    version: 1,
  });
  expect((await service.read(a, id)).items).toEqual([]);
  expect(
    await db.auditEvent.count({
      where: { exitCaseId: id, action: "settlement_saved" },
    }),
  ).toBe(2);
  expect(
    await db.auditEvent.count({
      where: { exitCaseId: id, action: "settlement_removed" },
    }),
  ).toBe(1);
});
it("isolates read and every command across users and prevents ownership injection", async () => {
  const { item } = await settlement();
  const { data } = await pension();
  const commands = [
    { action: "settlement_save", item },
    { action: "settlement_remove", id: "missing", version: 0 },
    { action: "pension_start" },
    {
      action: "pension_save",
      input: {
        version: 1,
        targetPeriod: "2026-10",
        statementRunId: null,
        expectedFieldId: null,
        expectedFieldVersion: null,
        followUpDate: null,
      },
    },
    {
      action: "pension_confirm",
      version: 1,
      evidenceToken: data.pension!.evidenceToken,
    },
  ];
  await expect(service.read(b, id)).rejects.toMatchObject({ status: 404 });
  await expect(service.read("", id)).rejects.toMatchObject({ status: 401 });
  for (const cmd of commands)
    await expect(service.command(b, id, cmd)).rejects.toMatchObject({
      status: 404,
    });
  await expect(
    service.command(a, id, {
      action: "settlement_save",
      item: { ...item, userId: b },
    }),
  ).rejects.toThrow();
  await expect(
    db.pensionVerification.update({
      where: { exitCaseId: id },
      data: { userId: b },
    }),
  ).rejects.toThrow();
});
it("rejects evidence from another employment, proposed fields and wrong categories", async () => {
  const { item, expected } = await settlement();
  const sibling = (
    await db.employment.create({
      data: {
        userId: a,
        employerName: "Other",
        roleTitle: "Worker",
        startDate: new Date("2024-01-01"),
      },
    })
  ).id;
  const foreign = await source("payslip", { gross_pay: "NGN 1" }, sibling);
  await expect(
    service.command(a, id, {
      action: "settlement_save",
      item: { ...item, expectedFieldId: foreign.field.id },
    }),
  ).rejects.toMatchObject({ status: 422 });
  await db.extractedField.update({
    where: { id: expected.field.id },
    data: { reviewState: "proposed" },
  });
  await expect(
    service.command(a, id, { action: "settlement_save", item }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    service.command(a, id, {
      action: "settlement_save",
      item: { ...item, documentId: expected.doc.id },
    }),
  ).rejects.toMatchObject({ status: 422 });
});
it("invalidates revised/rejected/deleted evidence, flags duplicates and does not copy amounts", async () => {
  const { item, expected, actual } = await settlement();
  const saved = await service.command(a, id, {
    action: "settlement_save",
    item,
  });
  const stored = await db.settlementItem.findUnique({
    where: { id: saved.items[0]!.id },
  });
  expect(JSON.stringify(stored)).not.toContain("250000");
  await service.command(a, id, { action: "settlement_save", item });
  expect(
    (await service.read(a, id)).items.every(
      (i) => i.result.state === "needs_clarification",
    ),
  ).toBe(true);
  await db.extractedField.update({
    where: { id: expected.field.id },
    data: { version: 2, value: "NGN 260000", reviewState: "corrected" },
  });
  expect((await service.read(a, id)).items[0]!.expectedValue).toBeNull();
  await db.employmentDocument.delete({ where: { id: actual.doc.id } });
  expect((await service.read(a, id)).items[0]!.result.state).toBe(
    "needs_clarification",
  );
});
it("explicitly confirms a current match; changed source revokes confirmation and stale tokens fail", async () => {
  const { statement, data } = await pension();
  expect(data.pension!.result.state).toBe("contribution_detected");
  await expect(
    service.command(a, id, {
      action: "pension_confirm",
      version: 1,
      evidenceToken: "0".repeat(64),
    }),
  ).rejects.toMatchObject({ status: 409 });
  const confirmed = await service.command(a, id, {
    action: "pension_confirm",
    version: 1,
    evidenceToken: data.pension!.evidenceToken,
  });
  expect(confirmed.pension!.result.state).toBe("confirmed");
  expect(confirmed.pension!.followUpDate).toBe("2026-12-01");
  await db.extractedField.update({
    where: { id: statement.field.id },
    data: { version: 2 },
  });
  expect((await service.read(a, id)).pension!.result.state).toBe(
    "needs_clarification",
  );
  await expect(
    service.command(a, id, {
      action: "pension_confirm",
      version: 1,
      evidenceToken: data.pension!.evidenceToken,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.auditEvent.count({
      where: { exitCaseId: id, action: "pension_confirmed" },
    }),
  ).toBe(1);
});
it("revokes matches after employment changes and blocks rejected entries", async () => {
  const { statement, data } = await pension();
  await service.command(a, id, {
    action: "pension_confirm",
    version: 1,
    evidenceToken: data.pension!.evidenceToken,
  });
  await db.employment.update({
    where: { id: job },
    data: { employerName: "Changed" },
  });
  expect((await service.read(a, id)).pension!.result.state).toBe(
    "needs_clarification",
  );
  await db.extractedField.update({
    where: {
      id: statement.run.fields.find((f) => f.key === "contribution_1_period")!
        .id,
    },
    data: { reviewState: "rejected", value: null, version: 2 },
  });
  const result = await service.command(a, id, {
    action: "pension_save",
    input: {
      version: 2,
      targetPeriod: "2026-10",
      statementRunId: statement.run.id,
      expectedFieldId: null,
      expectedFieldVersion: null,
      followUpDate: null,
    },
  });
  expect(result.pension!.result.message).toContain("unreviewed or rejected");
});
it("creates one waiting follow-up on closing pension-enabled employment", async () => {
  await updateEmployment(a, job, {
    employerName: "Fixture",
    roleTitle: "Worker",
    startDate: "2024-01-01",
    endDate: "2026-10-31",
    employmentType: null,
    status: "closed",
  });
  await service.command(a, id, { action: "pension_start" });
  const result = await service.read(a, id);
  expect(result.pension).toMatchObject({
    targetPeriod: "2026-10",
    followUpDate: "2026-11-30",
    result: { state: "waiting" },
  });
  expect(
    await db.auditEvent.count({
      where: { exitCaseId: id, action: "pension_started" },
    }),
  ).toBe(1);
});
it("rolls back mutations if audit fails", async () => {
  const { item } = await settlement();
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
    financeService(guarded as unknown as typeof db).command(a, id, {
      action: "settlement_save",
      item,
    }),
  ).rejects.toThrow();
  expect((await service.read(a, id)).items).toEqual([]);
});
it("rejects foreign pension runs/deductions and unavailable statements", async () => {
  await service.command(a, id, { action: "pension_start" });
  const sibling = (
    await db.employment.create({
      data: {
        userId: a,
        employerName: "Other",
        roleTitle: "Worker",
        startDate: new Date("2024-01-01"),
      },
    })
  ).id;
  const foreign = await source(
    "pension_statement",
    { statement_start: "2026-10" },
    sibling,
  );
  const input = {
    version: 0,
    targetPeriod: "2026-10",
    statementRunId: foreign.run.id,
    expectedFieldId: null,
    expectedFieldVersion: null,
    followUpDate: null,
  };
  await expect(
    service.command(a, id, { action: "pension_save", input }),
  ).rejects.toMatchObject({ status: 422 });
  const wrong = await source("final_settlement", {
    pension_deduction: "NGN 20000",
  });
  await expect(
    service.command(a, id, {
      action: "pension_save",
      input: {
        ...input,
        statementRunId: null,
        expectedFieldId: wrong.field.id,
        expectedFieldVersion: 1,
      },
    }),
  ).rejects.toMatchObject({ status: 422 });
});
it("checks reviewed payslip period and employee deduction independently", async () => {
  const { statement } = await pension();
  const payslip = await source("payslip", {
    pension_deduction: "NGN 20000",
    pay_period: "2026-09",
  });
  const input = {
    version: 1,
    targetPeriod: "2026-10",
    statementRunId: statement.run.id,
    expectedFieldId: payslip.field.id,
    expectedFieldVersion: 1,
    followUpDate: null,
  };
  const mismatch = await service.command(a, id, {
    action: "pension_save",
    input,
  });
  expect(mismatch.pension!.result.state).toBe("needs_clarification");
  await db.extractedField.update({
    where: { id: payslip.run.fields.find((f) => f.key === "pay_period")!.id },
    data: { value: "2026-10", version: 2, reviewState: "corrected" },
  });
  expect((await service.read(a, id)).pension!.result.state).toBe(
    "contribution_detected",
  );
  await db.extractedField.update({
    where: { id: payslip.field.id },
    data: { value: "NGN 25000", version: 2 },
  });
  expect((await service.read(a, id)).pension!.result.state).toBe(
    "needs_clarification",
  );
});
it("requires participation, prevents confirmation without a match and rejects stale pension edits", async () => {
  await service.command(a, id, { action: "pension_start" });
  const current = (await service.read(a, id)).pension!;
  await expect(
    service.command(a, id, {
      action: "pension_confirm",
      version: 0,
      evidenceToken: current.evidenceToken,
    }),
  ).rejects.toMatchObject({ status: 409 });
  const input = {
    version: 0,
    targetPeriod: "2026-10",
    statementRunId: null,
    expectedFieldId: null,
    expectedFieldVersion: null,
    followUpDate: null,
  };
  await service.command(a, id, { action: "pension_save", input });
  await expect(
    service.command(a, id, { action: "pension_save", input }),
  ).rejects.toMatchObject({ status: 409 });
  await db.exitCase.update({
    where: { id },
    data: { pension: "no", version: 1 },
  });
  await expect(
    service.command(a, id, { action: "pension_start" }),
  ).rejects.toMatchObject({ status: 422 });
  expect((await service.read(a, id)).pension!.result.state).toBe(
    "needs_clarification",
  );
});
it("keeps manually removed contribution rows ambiguous even without an AI proposal", async () => {
  const { statement } = await pension();
  const field = statement.run.fields.find(
    (f) => f.key === "contribution_1_period",
  )!;
  await db.extractedField.update({
    where: { id: field.id },
    data: {
      proposedValue: null,
      value: null,
      reviewState: "rejected",
      version: 2,
    },
  });
  expect((await service.read(a, id)).pension!.result.message).toContain(
    "unreviewed or rejected",
  );
});
it("creates follow-up when pension is enabled on an already closed employment", async () => {
  await db.exitCase.update({ where: { id }, data: { pension: "no" } });
  await updateEmployment(a, job, {
    employerName: "Fixture",
    roleTitle: "Worker",
    startDate: "2024-01-01",
    endDate: "2026-10-31",
    employmentType: null,
    status: "closed",
  });
  expect((await service.read(a, id)).pension).toBeNull();
  await exitService(db).update(a, id, {
    version: 0,
    answers: exitSchema.parse({
      exitType: "retirement",
      lastWorkingDate: "2026-10-31",
      pension: "yes",
    }),
  });
  expect((await service.read(a, id)).pension!.result.state).toBe("waiting");
});
it("binds confirmation to the reviewed payslip period revision as well as its amount", async () => {
  const { statement } = await pension();
  const payslip = await source("payslip", {
    pension_deduction: "NGN 20000",
    pay_period: "2026-10",
  });
  const saved = await service.command(a, id, {
    action: "pension_save",
    input: {
      version: 1,
      targetPeriod: "2026-10",
      statementRunId: statement.run.id,
      expectedFieldId: payslip.field.id,
      expectedFieldVersion: 1,
      followUpDate: null,
    },
  });
  await service.command(a, id, {
    action: "pension_confirm",
    version: 2,
    evidenceToken: saved.pension!.evidenceToken,
  });
  await db.extractedField.update({
    where: { id: payslip.run.fields.find((f) => f.key === "pay_period")!.id },
    data: { version: 2 },
  });
  expect((await service.read(a, id)).pension!.result.state).toBe(
    "needs_clarification",
  );
});
