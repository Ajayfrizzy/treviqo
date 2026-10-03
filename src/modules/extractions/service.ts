import "server-only";
import { createHash } from "node:crypto";
import type { PrismaClient, Prisma, DocumentType } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { getObjectStorage, type PrivateObjectStorage } from "@/server/storage/client";
import { getDocumentAI, type DocumentAI } from "@/server/ai/client";
import { ContentError, prepareDocument } from "@/server/ai/content";
import { DocumentError } from "@/modules/documents/validation";
import { startSchema, reviewSchema, fieldLabels, supportedTypes, type ExtractionType, type ExtractionRecord } from "./shared";
import { parseClassification, parseFields, PROMPT_VERSION, SCHEMA_VERSION } from "./schema";
import { classificationPrompt, extractionPrompt } from "./prompts";
import { allowExtraction } from "./rate-limit";
const leaseMs = 120000;
type Tx = Prisma.TransactionClient;
type Proposal = { key: string; value: string | null; evidence: string | null; confidence: "high" | "medium" | "low" | "needs_review" };
class ExtractionFailure extends Error { constructor(public code: string) { super(code); } }
const fieldSelect = { id: true, key: true, proposedValue: true, value: true, evidence: true, confidence: true, reviewState: true, version: true, revisions: { select: { id: true, state: true, value: true, createdAt: true }, orderBy: { createdAt: "desc" as const }, take: 20 } } satisfies Prisma.ExtractedFieldSelect;
const selection = { id: true, status: true, documentType: true, sourceKind: true, model: true, promptVersion: true, schemaVersion: true, errorCode: true, createdAt: true, fields: { select: fieldSelect, orderBy: { key: "asc" as const } } } satisfies Prisma.DocumentExtractionSelect;
type Row = Prisma.DocumentExtractionGetPayload<{ select: typeof selection }>;
function serialize(row: Row): ExtractionRecord { return { ...row, createdAt: row.createdAt.toISOString(), fields: row.fields.map(field => ({ ...field, revisions: field.revisions.map(revision => ({ ...revision, createdAt: revision.createdAt.toISOString() })) })) }; }
export function extractionService(db: PrismaClient = getDb(), dependencies: {
  storage?: () => PrivateObjectStorage; ai?: () => DocumentAI;
  prepare?: typeof prepareDocument; allow?: typeof allowExtraction;
} = {}) {
  const storage = dependencies.storage ?? getObjectStorage;
  const ai = dependencies.ai ?? getDocumentAI;
  const prepare = dependencies.prepare ?? prepareDocument;
  const allow = dependencies.allow ?? allowExtraction;
  async function document(tx: Tx, userId: string, documentId: string, lock = false) {
    if (!userId) throw new DocumentError("Sign in to review documents.", 401);
    if (lock) await tx.$queryRaw`SELECT "id" FROM "EmploymentDocument" WHERE "id" = ${documentId} AND "userId" = ${userId} FOR UPDATE`;
    const doc = await tx.employmentDocument.findFirst({ where: { id: documentId, userId, status: "ready", employment: { userId } } });
    if (!doc) throw new DocumentError("Document not found or not ready.", 404);
    return doc;
  }
  async function audit(tx: Tx, doc: { id: string; userId: string; employmentId: string }, action: "extraction_started" | "extraction_completed" | "extraction_failed" | "extraction_reviewed") {
    await tx.auditEvent.create({ data: { documentId: doc.id, userId: doc.userId, employmentId: doc.employmentId, action } });
  }
  return {
    async read(userId: string, documentId: string, runId?: string) {
      await document(db, userId, documentId);
      const attempts = await db.documentExtraction.findMany({ where: { userId, documentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, select: { id: true, status: true, createdAt: true } });
      const current = await db.documentExtraction.findFirst({ where: { userId, documentId, ...(runId ? { id: runId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: selection });
      if (runId && !current) throw new DocumentError("Extraction not found.", 404);
      return { extraction: current ? serialize(current) : null, attempts: attempts.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })) };
    },
    async start(userId: string, documentId: string, raw: unknown) {
      const input = startSchema.parse(raw);
      const owned = await document(db, userId, documentId);
      if (!await allow(userId)) throw new DocumentError("Too many attempts. Try again in 10 minutes; existing reviews remain available.", 429);
      const run = await db.$transaction(async tx => {
        const doc = await document(tx, userId, documentId, true);
        const active = await tx.documentExtraction.findFirst({ where: { documentId, userId, status: "processing", createdAt: { gt: new Date(Date.now() - leaseMs) } } });
        if (active) throw new DocumentError("An extraction is already running. Refresh shortly.", 409);
        await tx.documentExtraction.updateMany({ where: { documentId, userId, status: "processing" }, data: { status: "failed", errorCode: "interrupted" } });
        const created = await tx.documentExtraction.create({ data: { userId, documentId, sourceKind: input.mode === "manual" ? "manual" : input.text ? "user_transcript" : "pdf_text", model: input.mode === "manual" ? "manual" : "unconfigured", promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION } });
        await audit(tx, doc, "extraction_started"); return created;
      });
      let model = run.model; let sourceHash: string | null = null;
      try {
        let type: DocumentType; let proposals: Proposal[];
        if (input.mode === "manual") {
          type = input.type;
          proposals = Object.keys(fieldLabels[input.type]).map(key => ({ key, value: null, evidence: null, confidence: "needs_review" }));
        } else {
          let provider: DocumentAI; try { provider = ai(); model = provider.model; } catch { throw new ExtractionFailure("unavailable"); }
          let source: string;
          if (input.text) source = input.text;
          else {
            let bytes: Buffer;
            try { bytes = await storage().read(owned.objectKey, 20 * 1048576); } catch { throw new ExtractionFailure("unavailable"); }
            if (createHash("sha256").update(bytes).digest("hex") !== owned.checksum) throw new ExtractionFailure("unreadable");
            source = await prepare(bytes, owned.mimeType);
          }
          sourceHash = createHash("sha256").update(source).digest("hex");
          const complete = async (task: Parameters<DocumentAI["complete"]>[0]) => {
            try { return await provider.complete(task); } catch { throw new ExtractionFailure("unavailable"); }
          };
          let classification;
          if (input.type) classification = { type: input.type, evidence: null, confidence: "needs_review" as const };
          else {
            const raw = await complete(classificationPrompt(source));
            try { classification = parseClassification(raw, source); } catch { throw new ExtractionFailure("malformed"); }
          }
          type = classification.type;
          proposals = [{ key: "document_type", value: type, evidence: classification.evidence, confidence: classification.confidence }];
          // Ambiguous classification never chooses a field schema without the worker.
          if (type !== "other" && (input.type || !["low", "needs_review"].includes(classification.confidence))) {
            const raw = await complete(extractionPrompt(source, type));
            try { proposals.push(...parseFields(raw, type, source)); } catch { throw new ExtractionFailure("malformed"); }
          }
        }
        await db.$transaction(async tx => {
          const doc = await document(tx, userId, documentId, true);
          const changed = await tx.documentExtraction.updateMany({ where: { id: run.id, userId, status: "processing", createdAt: { gt: new Date(Date.now() - leaseMs) } }, data: { status: "ready", documentType: type, sourceHash, model } });
          if (!changed.count) throw new DocumentError("This attempt expired. Refresh and retry.", 409);
          await tx.extractedField.createMany({ data: proposals.map(proposal => ({ extractionId: run.id, key: proposal.key, proposedValue: proposal.value, evidence: proposal.evidence, confidence: proposal.confidence })) });
          await audit(tx, doc, "extraction_completed");
        });
      } catch (error) {
        if (error instanceof DocumentError) throw error;
        const code = error instanceof ContentError || error instanceof ExtractionFailure ? error.code : "interrupted";
        await db.$transaction(async tx => {
          const doc = await document(tx, userId, documentId, true);
          const changed = await tx.documentExtraction.updateMany({ where: { id: run.id, status: "processing", userId }, data: { status: "failed", errorCode: code, sourceHash, model } });
          if (changed.count) await audit(tx, doc, "extraction_failed");
        });
      }
      return this.read(userId, documentId, run.id);
    },
    async review(userId: string, documentId: string, raw: unknown) {
      const input = reviewSchema.parse(raw);
      const runId = await db.$transaction(async tx => {
        const doc = await document(tx, userId, documentId, true);
        const field = await tx.extractedField.findFirst({ where: { id: input.fieldId, extraction: { documentId, userId, status: "ready" } } });
        if (!field) throw new DocumentError("Field not found.", 404);
        if (input.action === "confirm" && !field.proposedValue) throw new DocumentError("No proposal to confirm. Enter a value or mark unknown.", 422);
        const value = input.action === "correct" ? input.value! : input.action === "confirm" ? field.proposedValue : null;
        if (field.key === "document_type" && value && ![...supportedTypes, "other"].includes(value as ExtractionType)) throw new DocumentError("Choose a supported document category.", 422);
        const reviewState = { confirm: "confirmed", correct: "corrected", reject: "rejected", unknown: "unknown" } as const;
        const changed = await tx.extractedField.updateMany({ where: { id: field.id, version: input.version }, data: { value, reviewState: reviewState[input.action], version: { increment: 1 } } });
        if (!changed.count) throw new DocumentError("This field changed in another tab. Refresh before reviewing it.", 409);
        await tx.extractionFieldRevision.create({ data: { fieldId: field.id, state: reviewState[input.action], value } });
        await audit(tx, doc, "extraction_reviewed"); return field.extractionId;
      });
      return this.read(userId, documentId, runId);
    },
  };
}
