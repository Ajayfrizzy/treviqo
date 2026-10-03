import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { DocumentError } from "@/modules/documents/validation";
import { buildChecklist, RULES_VERSION } from "./rules";
import { createExitSchema, updateExitSchema, exitSchema, documentSlots, type ExitInput, type ExitEvidence, type ExitRecord } from "./shared";
type Tx = Prisma.TransactionClient;
export function exitService(db: PrismaClient = getDb()) {
  function authenticated(userId: string) { if (!userId) throw new DocumentError("Sign in to access exit cases.", 401); }
  async function employment(tx: Tx, userId: string, employmentId: string) {
    authenticated(userId);
    const job = await tx.employment.findFirst({ where: { id: employmentId, userId }, select: { id: true, employerName: true, roleTitle: true, startDate: true } });
    if (!job) throw new DocumentError("Employment record not found.", 404);
    return job;
  }
  async function evidence(tx: Tx, userId: string, employmentId: string): Promise<ExitEvidence> {
    const job = await employment(tx, userId, employmentId);
    const documents = await tx.employmentDocument.findMany({ where: { userId, employmentId, status: "ready", employment: { userId } }, select: { id: true, sanitizedFilename: true, documentType: true }, orderBy: { createdAt: "desc" } });
    const fields = await tx.extractedField.findMany({ where: { key: "notice_period", value: { not: null }, reviewState: { in: ["confirmed", "corrected"] }, extraction: { userId, status: "ready", documentType: "employment_contract", document: { userId, employmentId, status: "ready", employment: { userId } } } }, select: { id: true, version: true, value: true, extraction: { select: { document: { select: { id: true, sanitizedFilename: true } } } } }, orderBy: { updatedAt: "desc" } });
    return { employmentStart: job.startDate.toISOString().slice(0, 10), documents: documents.map(doc => ({ id: doc.id, name: doc.sanitizedFilename, type: doc.documentType })), noticeFields: fields.map(field => ({ id: field.id, version: field.version, value: field.value!, documentId: field.extraction.document.id, name: field.extraction.document.sanitizedFilename })) };
  }
  async function validateEvidence(tx: Tx, userId: string, employmentId: string, input: ExitInput, previous?: ExitInput) {
    const current = await evidence(tx, userId, employmentId);
    if (input.lastWorkingDate < current.employmentStart) throw new DocumentError("Last working date cannot be before the employment start date.", 422);
    for (const key of documentSlots) {
      const id = input[key];
      if (id && id !== previous?.[key] && !current.documents.some(doc => doc.id === id)) throw new DocumentError("Select available evidence from this employment only.", 422);
    }
    if (input.noticeFieldId && (input.noticeFieldId !== previous?.noticeFieldId || input.noticeFieldVersion !== previous?.noticeFieldVersion) && !current.noticeFields.some(field => field.id === input.noticeFieldId && field.version === input.noticeFieldVersion)) throw new DocumentError("Select a current confirmed or corrected notice field from this employment.", 422);
  }
  function stored(input: ExitInput) { return { ...input, lastWorkingDate: new Date(`${input.lastWorkingDate}T00:00:00Z`), noticeDate: input.noticeDate ? new Date(`${input.noticeDate}T00:00:00Z`) : null }; }
  type Row = Prisma.ExitCaseGetPayload<{ include: { employment: { select: { employerName: true; roleTitle: true } } } }>;
  function answers(row: Row): ExitInput { return exitSchema.parse({ ...Object.fromEntries(Object.keys(exitSchema.shape).map(key => [key, row[key as keyof Row]])), lastWorkingDate: row.lastWorkingDate.toISOString().slice(0, 10), noticeDate: row.noticeDate?.toISOString().slice(0, 10) ?? null }); }
  async function find(tx: Tx, userId: string, id: string) {
    authenticated(userId);
    const row = await tx.exitCase.findFirst({ where: { id, userId, employment: { userId } }, include: { employment: { select: { employerName: true, roleTitle: true } } } });
    if (!row) throw new DocumentError("Exit case not found.", 404);
    return row;
  }
  return {
    async evidence(userId: string, employmentId: string) { return db.$transaction(tx => evidence(tx, userId, employmentId), { isolationLevel: "RepeatableRead" }); },
    async list(userId: string) {
      authenticated(userId);
      return (await db.exitCase.findMany({ where: { userId, employment: { userId } }, select: { id: true, employmentId: true, exitType: true, lastWorkingDate: true, updatedAt: true, employment: { select: { employerName: true, roleTitle: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] })).map(row => ({ ...row, lastWorkingDate: row.lastWorkingDate.toISOString().slice(0, 10), updatedAt: row.updatedAt.toISOString() }));
    },
    async detail(userId: string, id: string): Promise<ExitRecord> {
      // One consistent snapshot; no persisted checklist can outlive its evidence.
      return db.$transaction(async tx => {
        const row = await find(tx, userId, id); const input = answers(row);
        const context = await evidence(tx, userId, row.employmentId);
        return { id: row.id, employmentId: row.employmentId, employerName: row.employment.employerName, roleTitle: row.employment.roleTitle, version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), answers: input, rulesVersion: RULES_VERSION, checklist: buildChecklist(input, context) };
      }, { isolationLevel: "RepeatableRead" });
    },
    async create(userId: string, raw: unknown) {
      authenticated(userId); const input = createExitSchema.parse(raw);
      try {
        const id = await db.$transaction(async tx => {
          await validateEvidence(tx, userId, input.employmentId, input.answers);
          const row = await tx.exitCase.create({ data: { userId, employmentId: input.employmentId, ...stored(input.answers) } });
          await tx.auditEvent.create({ data: { userId, employmentId: row.employmentId, exitCaseId: row.id, action: "exit_created" } });
          return row.id;
        });
        return this.detail(userId, id);
      } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new DocumentError("This employment already has an exit case. Open it to update your answers.", 409); throw error; }
    },
    async update(userId: string, id: string, raw: unknown) {
      authenticated(userId); const input = updateExitSchema.parse(raw);
      await db.$transaction(async tx => {
        const row = await find(tx, userId, id);
        await validateEvidence(tx, userId, row.employmentId, input.answers, answers(row));
        const changed = await tx.exitCase.updateMany({ where: { id, userId, version: input.version }, data: { ...stored(input.answers), version: { increment: 1 } } });
        if (!changed.count) throw new DocumentError("This exit case changed in another tab. Reload before saving.", 409);
        await tx.auditEvent.create({ data: { userId, employmentId: row.employmentId, exitCaseId: id, action: "exit_updated" } });
      });
      return this.detail(userId, id);
    },
  };
}
