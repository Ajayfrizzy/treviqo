import "server-only";
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { DocumentError } from "@/modules/documents/validation";
import { commandSchema, type FinanceView, type ReviewedField, type Run, expectedKeys } from "./shared";
import { compareSettlement, matchPension, FINANCE_RULES_VERSION } from "./rules";
type Tx = Prisma.TransactionClient;
export function financeService(db: PrismaClient = getDb()) {
  async function owner(tx: Tx, userId: string, id: string, lock = false) {
    if (!userId) throw new DocumentError("Sign in to review settlement and pension records.", 401);
    if (lock) await tx.$queryRaw`SELECT "id" FROM "ExitCase" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
    const row = await tx.exitCase.findFirst({ where: { id, userId, employment: { userId } }, include: { employment: { select: { employerName: true, status: true, endDate: true, updatedAt: true } } } });
    if (!row) throw new DocumentError("Exit case not found.", 404); return row;
  }
  async function sources(tx: Tx, userId: string, employmentId: string) {
    const docs = await tx.employmentDocument.findMany({ where: { userId, employmentId, status: "ready", employment: { userId } }, select: { id: true, sanitizedFilename: true, documentType: true } });
    const runs = await tx.documentExtraction.findMany({ where: { userId, status: "ready", documentId: { in: docs.map(doc => doc.id) } }, include: { fields: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    const fields: ReviewedField[] = [];
    const statementRuns: Run[] = [];
    for (const run of runs) {
      const doc = docs.find(doc => doc.id === run.documentId)!;
      const reviewed = run.fields.filter(field => ["confirmed", "corrected"].includes(field.reviewState) && field.value !== null).map(field => ({ id: field.id, version: field.version, key: field.key, value: field.value!, documentId: doc.id, documentName: doc.sanitizedFilename, type: run.documentType ?? "other", runId: run.id }));
      fields.push(...reviewed);
      if (run.documentType === "pension_statement" && doc.documentType === "pension_statement") statementRuns.push({ id: run.id, documentId: doc.id, name: doc.sanitizedFilename, fields: reviewed, incomplete: run.fields.some(field => field.key.startsWith("contribution_") && (field.proposedValue !== null || field.version > 0) && !["confirmed", "corrected"].includes(field.reviewState)) });
    }
    return { docs, fields, statementRuns };
  }
  async function view(tx: Tx, userId: string, id: string): Promise<FinanceView> {
    const record = await owner(tx, userId, id); const source = await sources(tx, userId, record.employmentId);
    const saved = await tx.settlementItem.findMany({ where: { exitCaseId: id, userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const resolve = (id: string | null, version: number | null) => source.fields.find(field => field.id === id && field.version === version);
    const items = saved.map(item => {
      const expected = resolve(item.expectedFieldId, item.expectedFieldVersion); const actual = resolve(item.actualFieldId, item.actualFieldVersion);
      const duplicate = saved.some(other => other.id !== item.id && (other.expectedFieldId === item.expectedFieldId || (item.actualFieldId && other.actualFieldId === item.actualFieldId)));
      return { id: item.id, version: item.version, category: item.category, label: item.label, documentId: item.documentId, expectedFieldId: item.expectedFieldId, expectedFieldVersion: item.expectedFieldVersion, actualFieldId: item.actualFieldId, actualFieldVersion: item.actualFieldVersion, expectedPeriod: item.expectedPeriod, actualPeriod: item.actualPeriod, expectedValue: expected?.value ?? null, actualValue: actual?.value ?? null,
        result: compareSettlement({ currentDocument: source.docs.some(doc => doc.id === item.documentId && doc.documentType === "final_settlement"), duplicate, expected, actual, actualSelected: Boolean(item.actualFieldId), expectedPeriod: item.expectedPeriod, actualPeriod: item.actualPeriod }) };
    });
    const pension = await tx.pensionVerification.findFirst({ where: { exitCaseId: id, userId } });
    let pensionView: FinanceView["pension"] = null;
    if (pension) {
      const run = source.statementRuns.find(run => run.id === pension.statementRunId);
      const expected = resolve(pension.expectedFieldId, pension.expectedFieldVersion);
      const expectedPeriodField = expected ? source.fields.find(field => field.runId === expected.runId && field.key === "pay_period") : undefined;
      const matchInput = { applicable: record.pension === "yes", employer: record.employment.employerName, targetPeriod: pension.targetPeriod, run, runSelected: Boolean(pension.statementRunId), expected, expectedSelected: Boolean(pension.expectedFieldId), expectedPeriod: expectedPeriodField?.value };
      let result = matchPension(matchInput);
      const evidenceToken = createHash("sha256").update(JSON.stringify({ rules: FINANCE_RULES_VERSION, caseVersion: record.version, employment: record.employment, lastWorkingDate: record.lastWorkingDate, input: matchInput, expectedPeriodField, result })).digest("hex");
      if (pension.confirmedHash) result = pension.confirmedHash === evidenceToken && result.state === "contribution_detected" ? { state: "confirmed", message: "You confirmed the matching reviewed statement entry. This records your confirmation, not independent provider verification.", nextAction: "Retain the statement. Changed evidence will require a new review." } : { state: "needs_clarification", message: "Evidence or exit/employment details changed after your confirmation. The earlier confirmation no longer applies.", nextAction: "Review current evidence, save your selections again, and confirm a current match." };
      pensionView = { id: pension.id, version: pension.version, targetPeriod: pension.targetPeriod, statementRunId: pension.statementRunId, expectedFieldId: pension.expectedFieldId, expectedFieldVersion: pension.expectedFieldVersion, followUpDate: pension.followUpDate?.toISOString().slice(0,10) ?? null, confirmedAt: pension.confirmedAt?.toISOString() ?? null, result, evidenceToken };
    }
    return { exitCaseId: id, employerName: record.employment.employerName, pensionApplicable: record.pension === "yes", defaultPeriod: record.lastWorkingDate.toISOString().slice(0,7), documents: source.docs.filter(doc => doc.documentType === "final_settlement").map(doc => ({ id: doc.id, name: doc.sanitizedFilename })), fields: source.fields, runs: source.statementRuns, items, pension: pensionView };
  }
  return {
    // Reuse the same authorized projection inside another domain snapshot.
    readInTransaction: view,
    read(userId: string, id: string) { return db.$transaction(tx => view(tx, userId, id), { isolationLevel: "RepeatableRead" }); },
    async command(userId: string, id: string, raw: unknown) {
      const command = commandSchema.parse(raw);
      await db.$transaction(async tx => {
        const record = await owner(tx, userId, id, true);
        const source = await sources(tx, userId, record.employmentId);
        const field = (fieldId: string, version: number) => source.fields.find(field => field.id === fieldId && field.version === version);
        const audit = async (action: "settlement_saved" | "settlement_removed" | "pension_started" | "pension_updated" | "pension_confirmed") => tx.auditEvent.create({ data: { userId, exitCaseId: id, employmentId: record.employmentId, action } });
        if (command.action === "settlement_save") {
          const item = command.item;
          if (!source.docs.some(doc => doc.id === item.documentId && doc.documentType === "final_settlement")) throw new DocumentError("Select a current final-settlement document from this employment.", 422);
          const expected = field(item.expectedFieldId, item.expectedFieldVersion);
          if (!expected || expected.documentId === item.documentId || !expectedKeys[item.category].includes(expected.key)) throw new DocumentError("Select an appropriate reviewed amount from another evidence document for this employment.", 422);
          const actual = item.actualFieldId ? field(item.actualFieldId, item.actualFieldVersion!) : undefined;
          if (item.actualFieldId && (!actual || actual.documentId !== item.documentId || actual.type !== "final_settlement" || actual.key !== item.category)) throw new DocumentError("Select the current reviewed settlement amount for this category.", 422);
          const { id: itemId, version, ...data } = item;
          if (itemId) { const changed = await tx.settlementItem.updateMany({ where: { id: itemId, userId, exitCaseId: id, version }, data: { ...data, version: { increment: 1 } } }); if (!changed.count) throw new DocumentError("Item changed or not found. Refresh before saving.", 409); }
          else { if (await tx.settlementItem.count({ where: { exitCaseId: id, userId } }) >= 50) throw new DocumentError("This review supports up to 50 comparison items.", 422); await tx.settlementItem.create({ data: { ...data, userId, exitCaseId: id } }); }
          await audit("settlement_saved");
        } else if (command.action === "settlement_remove") {
          const removed = await tx.settlementItem.deleteMany({ where: { id: command.id, version: command.version, userId, exitCaseId: id } }); if (!removed.count) throw new DocumentError("Item changed or not found. Refresh before removing.", 409); await audit("settlement_removed");
        } else if (command.action === "pension_start") {
          if (record.pension !== "yes") throw new DocumentError("Confirm pension participation in your exit answers first.", 422);
          const followUp = new Date(record.lastWorkingDate); followUp.setUTCDate(followUp.getUTCDate() + 30);
          const created = await tx.pensionVerification.createMany({ data: [{ exitCaseId: id, userId, targetPeriod: record.lastWorkingDate.toISOString().slice(0,7), followUpDate: followUp.getUTCFullYear() <= 9999 ? followUp : null }], skipDuplicates: true });
          if (created.count) await audit("pension_started");
        } else {
          if (record.pension !== "yes") throw new DocumentError("Clarify pension participation in your exit answers first.", 422);
          if (command.action === "pension_save") {
            const input = command.input;
            if (input.statementRunId && !source.statementRuns.some(run => run.id === input.statementRunId)) throw new DocumentError("Select a current pension-statement extraction from this employment.", 422);
            if (input.expectedFieldId) { const expected = field(input.expectedFieldId, input.expectedFieldVersion!); if (!expected || expected.type !== "payslip" || expected.key !== "pension_deduction") throw new DocumentError("Select a current reviewed payslip employee pension deduction.", 422); }
            const { version, followUpDate, ...data } = input;
            const updated = await tx.pensionVerification.updateMany({ where: { exitCaseId: id, userId, version }, data: { ...data, followUpDate: followUpDate ? new Date(`${followUpDate}T00:00:00Z`) : null, confirmedHash: null, confirmedAt: null, version: { increment: 1 } } });
            if (!updated.count) throw new DocumentError("Verification changed or not found. Refresh before saving.", 409); await audit("pension_updated");
          } else {
            const current = (await view(tx, userId, id)).pension;
            if (!current || current.version !== command.version || current.evidenceToken !== command.evidenceToken || current.result.state !== "contribution_detected") throw new DocumentError("The match changed or needs clarification. Refresh and review before confirming.", 409);
            await tx.pensionVerification.update({ where: { id: current.id }, data: { confirmedHash: current.evidenceToken, confirmedAt: new Date(), version: { increment: 1 } } });
            await audit("pension_confirmed");
          }
        }
      }, { isolationLevel: "Serializable" });
      return this.read(userId, id);
    },
  };
}
