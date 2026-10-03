import { beforeEach, afterEach, afterAll, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { exitService } from "@/modules/exits/service";
import { exitSchema, type ExitInput } from "@/modules/exits/shared";
const db = getDb(); const service = () => exitService(db);
let a: string; let b: string; let job: string; let otherJob: string; let siblingJob: string; let doc: string;
const base = exitSchema.parse({ exitType: "resignation", lastWorkingDate: "2026-10-31" });
const create = (answers: Partial<ExitInput> = {}) => service().create(a, { employmentId: job, answers: { ...base, ...answers } });
async function document(userId: string, employmentId: string, type: "payslip" | "employment_contract" = "payslip") {
  return db.employmentDocument.create({ data: { userId, employmentId, documentType: type, originalFilename: "fixture.pdf", sanitizedFilename: "fixture.pdf", objectKey: crypto.randomUUID(), mimeType: "application/pdf", fileSize: 1, checksum: "fixture", status: "ready" } });
}
beforeEach(async () => {
  a = (await db.user.create({ data: {} })).id; b = (await db.user.create({ data: {} })).id;
  const makeJob = async (userId: string) => (await db.employment.create({ data: { userId, employerName: "Fixture", roleTitle: "Worker", startDate: new Date("2024-01-01") } })).id;
  job = await makeJob(a); otherJob = await makeJob(b); siblingJob = await makeJob(a); doc = (await document(a, job)).id;
});
afterEach(async () => { await db.auditEvent.deleteMany({ where: { userId: { in: [a,b] } } }); await db.employmentDocument.deleteMany({ where: { userId: { in: [a,b] } } }); await db.user.deleteMany({ where: { id: { in: [a,b] } } }); });
afterAll(async () => { await db.$disconnect(); });
it("persists owned cases with nine live rules, audit and no employment mutation", async () => {
  const record = await create({ finalPayDocumentId: doc, finalPayPeriod: "October 2026" });
  expect(record.checklist).toHaveLength(9); expect(record).not.toHaveProperty("userId"); expect(record.answers.lastWorkingDate).toBe("2026-10-31");
  expect((await service().list(a))[0]!.id).toBe(record.id);
  expect(await db.employment.findUnique({ where: { id: job } })).toMatchObject({ status: "active", endDate: null });
  expect(await db.auditEvent.findFirst({ where: { exitCaseId: record.id } })).toMatchObject({ action: "exit_created", documentId: null });
});
it("supports each of the five types and saves partial answers for later", async () => {
  const record = await create();
  for (const [index, exitType] of ["termination", "redundancy", "contract_completion", "retirement"].entries()) {
    const updated = await service().update(a, record.id, { version: index, answers: { ...base, exitType } });
    expect(updated.answers.exitType).toBe(exitType); expect(updated.answers.pension).toBe("unknown");
  }
});
it("isolates all read/write/list/evidence operations and rejects unauthenticated service access", async () => {
  const record = await create(); expect(await service().list(b)).toEqual([]);
  await expect(service().detail(b, record.id)).rejects.toMatchObject({ status: 404 });
  await expect(service().update(b, record.id, { version: 0, answers: base })).rejects.toMatchObject({ status: 404 });
  await expect(service().create(a, { employmentId: otherJob, answers: base })).rejects.toMatchObject({ status: 404 });
  await expect(service().evidence(b, job)).rejects.toMatchObject({ status: 404 });
  await expect(service().list("")).rejects.toMatchObject({ status: 401 });
  await expect(service().create("", { employmentId: job, answers: base })).rejects.toMatchObject({ status: 401 });
});
it("rejects injected ownership, foreign documents and same-user evidence from a different employment", async () => {
  const foreign = await document(b, otherJob); const sibling = await document(a, siblingJob);
  for (const id of [foreign.id, sibling.id, "missing"]) await expect(create({ finalPayDocumentId: id })).rejects.toMatchObject({ status: 422 });
  await expect(service().create(a, { employmentId: job, answers: base, userId: b })).rejects.toThrow();
  const record = await create(); await expect(service().update(a, record.id, { version: 0, answers: base, employmentId: otherJob })).rejects.toThrow();
});
it("enforces employment ownership in PostgreSQL and allows one case per employment even concurrently", async () => {
  const attempts = await Promise.allSettled([create(), create()]); expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(attempts.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
  const record = (await service().list(a))[0]!;
  await expect(db.exitCase.update({ where: { id: record.id }, data: { userId: b } })).rejects.toThrow();
});
it("validates employment dates and protects concurrent case edits", async () => {
  await expect(create({ lastWorkingDate: "2023-12-31" })).rejects.toMatchObject({ status: 422 });
  const record = await create(); await service().update(a, record.id, { version: 0, answers: { ...base, leave: "resolved" } });
  await expect(service().update(a, record.id, { version: 0, answers: base })).rejects.toMatchObject({ status: 409 });
  expect((await service().detail(a, record.id)).answers.leave).toBe("resolved");
});
it("recomputes after document deletion and allows unrelated edits while retaining missing references", async () => {
  const record = await create({ finalPayDocumentId: doc, finalPayPeriod: "October" });
  expect(record.checklist.find(item => item.ruleId === "final_salary")!.state).toBe("complete");
  await db.employmentDocument.update({ where: { id: doc }, data: { status: "deleting" } });
  const changed = await service().detail(a, record.id); expect(changed.checklist.find(item => item.ruleId === "final_salary")!.state).toBe("missing");
  expect(changed.checklist.flatMap(item => item.evidenceRefs).some(ref => ref.kind === "document" && ref.id === doc)).toBe(false);
  await service().update(a, record.id, { version: 0, answers: { ...changed.answers, leave: "none" } });
});
it("offers only confirmed/corrected contract notice and invalidates changed/rejected/deleted evidence", async () => {
  const contract = await document(a, job, "employment_contract");
  const run = await db.documentExtraction.create({ data: { userId: a, documentId: contract.id, documentType: "employment_contract", status: "ready", sourceKind: "manual", model: "manual", promptVersion: "v1", schemaVersion: "v1" } });
  const field = await db.extractedField.create({ data: { extractionId: run.id, key: "notice_period", confidence: "high", proposedValue: "30 days" } });
  expect((await service().evidence(a, job)).noticeFields).toEqual([]);
  await expect(create({ noticeFieldId: field.id, noticeFieldVersion: 0 })).rejects.toMatchObject({ status: 422 });
  await db.extractedField.update({ where: { id: field.id }, data: { value: "30 days", reviewState: "confirmed", version: 1 } });
  const record = await create({ noticeApplicable: "yes", noticeDate: "2026-10-01", noticeFieldId: field.id, noticeFieldVersion: 1 });
  expect(record.checklist[0]!.state).toBe("complete");
  await db.extractedField.update({ where: { id: field.id }, data: { value: "60 days", reviewState: "corrected", version: 2 } });
  expect((await service().detail(a, record.id)).checklist[0]!.state).toBe("needs_clarification");
  await db.extractedField.update({ where: { id: field.id }, data: { value: null, reviewState: "rejected", version: 3 } });
  expect((await service().evidence(a, job)).noticeFields).toEqual([]);
  await db.employmentDocument.delete({ where: { id: contract.id } });
  expect((await service().detail(a, record.id)).checklist[0]!.state).toBe("needs_clarification");
});
it("rolls back saved answers if auditing fails", async () => {
  const record = await create();
  const guarded = db.$extends({ query: { auditEvent: { async create() { throw new Error("audit unavailable"); } } } });
  await expect(exitService(guarded as unknown as typeof db).update(a, record.id, { version: 0, answers: { ...base, leave: "resolved" } })).rejects.toThrow();
  expect((await service().detail(a, record.id)).answers.leave).toBe("unknown");
});
