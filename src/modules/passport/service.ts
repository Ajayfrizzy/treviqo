import "server-only";
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { DocumentError } from "@/modules/documents/validation";
import { financeService } from "@/modules/finance/service";
import { exitService } from "@/modules/exits/service";
import { benefitCategories, passportCommand, type BenefitCategory, type PassportDetail, type PassportSummary } from "./shared";
import { benefitFieldKeys, classifyBenefit, dateWarning, maskSummary, PASSPORT_RULES_VERSION, providerSummary } from "./rules";
type Tx = Prisma.TransactionClient;
const documentGroups = [
  { category: "contract", label: "Employment contract", types: ["employment_contract"] },
  { category: "pay", label: "Pay records", types: ["payslip", "final_settlement"] },
  { category: "exit", label: "Exit documents", types: ["resignation_letter", "termination_letter", "exit_letter"] },
  { category: "pension", label: "Pension statements", types: ["pension_statement"] },
  { category: "benefits", label: "Benefit documents", types: ["benefit_document"] },
];
function authenticated(userId: string) { if (!userId) throw new DocumentError("Sign in to view your Passport.", 401); }
const date = (value: Date) => value.toISOString().slice(0,10);
export function passportService(db: PrismaClient = getDb()) {
  async function context(tx: Tx, userId: string, id: string, lock = false) {
    authenticated(userId);
    if (lock) await tx.$queryRaw`SELECT "id" FROM "Employment" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
    const job = await tx.employment.findFirst({ where: { id, userId, status: "closed" }, include: { exitCases: { where: { userId }, select: { id: true, version: true, exitType: true, pension: true } }, benefits: { where: { userId } } } });
    if (!job) throw new DocumentError("Passport entry not found. Only closed employment appears here.",404);
    const contextToken = createHash("sha256").update(JSON.stringify({ rules: PASSPORT_RULES_VERSION, employer: job.employerName, role: job.roleTitle, start: job.startDate, end: job.endDate, updatedAt: job.updatedAt, exit: job.exitCases })).digest("hex");
    const docs = await tx.employmentDocument.findMany({ where: { userId, employmentId: id, status: { not: "deleted" }, employment: { userId } }, select: { id: true, documentType: true, status: true, updatedAt: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    const fields = await tx.extractedField.findMany({ where: { key: { in: Object.keys(benefitFieldKeys) }, value: { not: null }, reviewState: { in: ["confirmed", "corrected"] }, extraction: { userId, status: "ready", document: { userId, employmentId: id, status: "ready", employment: { userId } } } }, select: { id: true, key: true, value: true, version: true, extraction: { select: { id: true, documentId: true, documentType: true } } }, orderBy: { id: "asc" } });
    const eligible = fields.filter(field => field.key === "provider" ? field.extraction.documentType === "pension_statement" && docs.some(doc => doc.id === field.extraction.documentId && doc.documentType === "pension_statement") : field.extraction.documentType === "employment_contract");
    return { job, contextToken, docs, fields: eligible };
  }
  async function detail(tx: Tx, userId: string, id: string): Promise<PassportDetail> {
    const { job, contextToken, docs, fields } = await context(tx,userId,id);
    const exitId = job.exitCases[0]?.id;
    const exit = exitId ? await exitService(db).readInTransaction(tx,userId,exitId) : null;
    const finance = exitId ? await financeService(db).readInTransaction(tx,userId,exitId) : null;
    const ready = docs.filter(doc => doc.status === "ready");
    const label = (doc: typeof docs[number]) => `${doc.documentType.replaceAll("_"," ")} · ${date(doc.createdAt)} · ${docs.indexOf(doc)+1}`;
    const sources = ready.map(doc => ({ id: doc.id, label: label(doc), fields: fields.filter(field => field.extraction.documentId === doc.id).map(field => ({ id: field.id, version: field.version, category: benefitFieldKeys[field.key]!, label: field.key === "provider" ? "Reviewed provider name" : `Reviewed ${benefitCategories[benefitFieldKeys[field.key]!] } wording` })) }));
    const benefits = (Object.keys(benefitCategories) as BenefitCategory[]).map(category => {
      const saved = job.benefits.find(item => item.category === category);
      const doc = ready.find(doc => doc.id === saved?.sourceDocumentId);
      const field = fields.find(field => field.id === saved?.sourceFieldId && field.version === saved.sourceFieldVersion && field.extraction.documentId === saved.sourceDocumentId && benefitFieldKeys[field.key] === category);
      const result = classifyBenefit({ saved: Boolean(saved), classification: saved?.classification ?? "unknown", contextCurrent: saved?.contextHash === contextToken, documentSelected: Boolean(saved?.sourceDocumentId), documentCurrent: Boolean(doc && doc.updatedAt.getTime() === saved?.sourceDocumentUpdatedAt?.getTime()), fieldSelected: Boolean(saved?.sourceFieldId), fieldCurrent: Boolean(field) });
      return { category, ...result, savedClassification: saved?.classification ?? "unknown", version: saved?.version ?? null, documentId: saved?.sourceDocumentId ?? null, fieldId: saved?.sourceFieldId ?? null, fieldVersion: saved?.sourceFieldVersion ?? null, updatedAt: saved?.updatedAt.toISOString() ?? null, basis: saved ? "Worker assessment based on selected evidence; not provider verification." : "No worker assessment saved. A document mention alone does not establish coverage or portability.", mentions: fields.filter(field => benefitFieldKeys[field.key] === category).map(field => ({ documentId: field.extraction.documentId, label: `Confirmed/corrected ${category === "pension" && field.key === "provider" ? "provider field" : "benefit wording"}` })) };
    });
    const selectedRun = finance?.pension?.statementRunId;
    const providers = fields.filter(field => field.key === "provider" && (!selectedRun || field.extraction.id === selectedRun));
    const provider = providerSummary(providers.map(field => field.value!));
    const startDate = date(job.startDate); const endDate = job.endDate ? date(job.endDate) : null;
    return {
      id: job.id, employer: maskSummary(job.employerName), role: maskSummary(job.roleTitle), startDate, endDate, exitType: exit?.answers.exitType ?? null,
      contextToken, refreshedAt: new Date().toISOString(), dateWarning: dateWarning(startDate,endDate,exit?.answers.lastWorkingDate),
      exit: exit ? { id: exit.id, type: exit.answers.exitType, lastWorkingDate: exit.answers.lastWorkingDate, unresolved: exit.checklist.filter(item => item.state !== "complete" && item.state !== "not_applicable").length, total: exit.checklist.length } : null,
      documents: documentGroups.map(group => { const matching = docs.filter(doc => group.types.includes(doc.documentType)); const available = matching.filter(doc => doc.status === "ready"); return { category: group.category, label: group.label, state: available.length ? "Available — record presence only" : matching.length ? "Unavailable / processing — review Documents" : "Not saved", records: available.map(doc => ({ id: doc.id, label: label(doc), review: fields.some(field => field.extraction.documentId === doc.id) ? "Includes confirmed/corrected benefit fields" : "Availability does not establish reviewed contents" })) }; }),
      pension: { participation: exit?.answers.pension ?? "unknown", provider: provider.provider, providerBasis: provider.basis, providerDocuments: [...new Set(providers.map(field => field.extraction.documentId))], state: finance?.pension?.result.state ?? "not_started", targetPeriod: finance?.pension?.targetPeriod ?? null },
      benefits, sources,
    };
  }
  return {
    async list(userId: string): Promise<PassportSummary[]> {
      authenticated(userId);
      const jobs = await db.employment.findMany({ where: { userId, status: "closed" }, select: { id: true, employerName: true, roleTitle: true, startDate: true, endDate: true, exitCases: { where: { userId }, select: { exitType: true } } }, orderBy: [{ startDate: "desc" }, { id: "asc" }] });
      return jobs.map(job => ({ id: job.id, employer: maskSummary(job.employerName), role: maskSummary(job.roleTitle), startDate: date(job.startDate), endDate: job.endDate ? date(job.endDate) : null, exitType: job.exitCases[0]?.exitType ?? null }));
    },
    read(userId: string,id: string) { return db.$transaction(tx => detail(tx,userId,id),{ isolationLevel: "RepeatableRead" }); },
    async command(userId: string,id: string,raw: unknown) {
      authenticated(userId); const command = passportCommand.parse(raw);
      await db.$transaction(async tx => {
        const current = await context(tx,userId,id,true);
        const category = command.action === "save" ? command.input.category : command.category;
        const saved = current.job.benefits.find(item => item.category === category);
        if (command.action === "remove") {
          if (!saved || saved.version !== command.version) throw new DocumentError("Assessment changed or not found. Refresh before removing.",409);
          await tx.benefit.delete({ where: { id: saved.id } });
          await tx.auditEvent.create({ data: { userId, employmentId: id, benefitId: saved.id, action: "benefit_removed" } });
          return;
        }
        const input = command.input;
        if (input.contextToken !== current.contextToken || input.version !== (saved?.version ?? null)) throw new DocumentError("This record changed. Refresh, check current sources and try again.",409);
        const doc = current.docs.find(doc => doc.id === input.documentId && doc.status === "ready");
        if (input.documentId && !doc) throw new DocumentError("Select current evidence belonging to this employment.",422);
        if (input.fieldId && !current.fields.some(field => field.id === input.fieldId && field.version === input.fieldVersion && field.extraction.documentId === input.documentId && benefitFieldKeys[field.key] === category)) throw new DocumentError("Select a current confirmed/corrected field for this benefit.",422);
        const data = { classification: input.classification, sourceDocumentId: doc?.id ?? null, sourceDocumentUpdatedAt: doc?.updatedAt ?? null, sourceFieldId: input.fieldId, sourceFieldVersion: input.fieldVersion, contextHash: current.contextToken };
        const benefit = saved ? await tx.benefit.update({ where: { id: saved.id }, data: { ...data, version: { increment: 1 } } }) : await tx.benefit.create({ data: { ...data, userId, employmentId: id, category } });
        await tx.auditEvent.create({ data: { userId, employmentId: id, benefitId: benefit.id, documentId: doc?.id, action: "benefit_saved" } });
      },{ isolationLevel: "Serializable" });
      return this.read(userId,id);
    },
  };
}
