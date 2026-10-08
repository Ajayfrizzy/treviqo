import "server-only";
import { createHash } from "node:crypto";
import type {
  PrismaClient,
  Prisma,
  DocumentType,
  EmploymentDocument,
} from "@prisma/client";
import { getDb } from "@/server/db/client";
import {
  getObjectStorage,
  type PrivateObjectStorage,
} from "@/server/storage/client";
import {
  getDocumentAI,
  InferenceError,
  type DocumentAI,
} from "@/server/ai/client";
import { ContentError, prepareDocument } from "@/server/ai/content";
import { DocumentError } from "@/modules/documents/validation";
import {
  startSchema,
  reviewSchema,
  fieldLabels,
  supportedTypes,
  type ExtractionType,
  type ExtractionRecord,
} from "./shared";
import {
  parseClassification,
  parseFields,
  PROMPT_VERSION,
  SCHEMA_VERSION,
} from "./schema";
import { classificationPrompt, extractionPrompt } from "./prompts";
import { allowExtraction } from "./rate-limit";
import { extractionDatabaseCode } from "./diagnostics";
import {
  persistAttempt,
  EXTRACTION_LEASE_MS as leaseMs,
  type Proposal,
} from "./persistence";
type Tx = Prisma.TransactionClient;
class ExtractionFailure extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const fieldSelect = {
  id: true,
  key: true,
  proposedValue: true,
  value: true,
  evidence: true,
  confidence: true,
  reviewState: true,
  version: true,
  revisions: {
    select: { id: true, state: true, value: true, createdAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 20,
  },
} satisfies Prisma.ExtractedFieldSelect;
const selection = {
  id: true,
  status: true,
  documentType: true,
  sourceKind: true,
  model: true,
  promptVersion: true,
  schemaVersion: true,
  errorCode: true,
  createdAt: true,
  fields: { select: fieldSelect, orderBy: { key: "asc" as const } },
} satisfies Prisma.DocumentExtractionSelect;
type Row = Prisma.DocumentExtractionGetPayload<{ select: typeof selection }>;
function serialize(row: Row): ExtractionRecord {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    fields: row.fields.map((field) => ({
      ...field,
      revisions: field.revisions.map((revision) => ({
        ...revision,
        createdAt: revision.createdAt.toISOString(),
      })),
    })),
  };
}
export function extractionService(
  db: PrismaClient = getDb(),
  dependencies: {
    storage?: () => PrivateObjectStorage;
    ai?: () => DocumentAI;
    prepare?: typeof prepareDocument;
    allow?: typeof allowExtraction;
  } = {},
) {
  const storage = dependencies.storage ?? getObjectStorage;
  const ai = dependencies.ai ?? getDocumentAI;
  const prepare = dependencies.prepare ?? prepareDocument;
  const allow = dependencies.allow ?? allowExtraction;
  async function document(
    tx: Tx,
    userId: string,
    documentId: string,
    lock = false,
  ) {
    if (!userId) throw new DocumentError("Sign in to review documents.", 401);
    if (lock) {
      const rows = await tx.$queryRaw<EmploymentDocument[]>`
        SELECT d.* FROM "EmploymentDocument" d
        JOIN "Employment" e ON e."id" = d."employmentId" AND e."userId" = d."userId"
        WHERE d."id" = ${documentId} AND d."userId" = ${userId} AND d."status" = 'ready'
        FOR UPDATE OF d`;
      if (!rows[0])
        throw new DocumentError("Document not found or not ready.", 404);
      return rows[0];
    }
    const doc = await tx.employmentDocument.findFirst({
      where: {
        id: documentId,
        userId,
        status: "ready",
        employment: { userId },
      },
    });
    if (!doc) throw new DocumentError("Document not found or not ready.", 404);
    return doc;
  }
  async function audit(
    tx: Tx,
    doc: { id: string; userId: string; employmentId: string },
    action:
      | "extraction_started"
      | "extraction_completed"
      | "extraction_failed"
      | "extraction_reviewed",
  ) {
    await tx.auditEvent.create({
      data: {
        documentId: doc.id,
        userId: doc.userId,
        employmentId: doc.employmentId,
        action,
      },
    });
  }
  return {
    async read(userId: string, documentId: string, runId?: string) {
      await document(db, userId, documentId);
      await persistAttempt(db, userId, documentId);
      const attempts = await db.documentExtraction.findMany({
        where: { userId, documentId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        select: { id: true, status: true, createdAt: true },
      });
      const current = await db.documentExtraction.findFirst({
        where: { userId, documentId, ...(runId ? { id: runId } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: selection,
      });
      if (runId && !current)
        throw new DocumentError("Extraction not found.", 404);
      return {
        extraction: current ? serialize(current) : null,
        attempts: attempts.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    },
    async start(userId: string, documentId: string, raw: unknown) {
      const input = startSchema.parse(raw);
      let stage = "document_lookup";
      try {
        const owned = await document(db, userId, documentId);
        stage = "extraction_limiter";
        if (!(await allow(userId)))
          throw new DocumentError(
            "Too many attempts. Try again in 10 minutes; existing reviews remain available.",
            429,
          );
        stage = "reservation";
        const run = await db.$transaction(async (tx) => {
          const doc = await document(tx, userId, documentId, true);
          const active = await tx.documentExtraction.findFirst({
            where: {
              documentId,
              userId,
              status: "processing",
              createdAt: { gt: new Date(Date.now() - leaseMs) },
            },
          });
          if (active)
            throw new DocumentError(
              "An extraction is already running. Refresh shortly.",
              409,
            );
          await persistAttempt(tx, userId, documentId);
          const created = await tx.documentExtraction.create({
            data: {
              userId,
              documentId,
              sourceKind:
                input.mode === "manual"
                  ? "manual"
                  : input.text
                    ? "user_transcript"
                    : "pdf_text",
              model: input.mode === "manual" ? "manual" : "unconfigured",
              promptVersion: PROMPT_VERSION,
              schemaVersion: SCHEMA_VERSION,
            },
          });
          await audit(tx, doc, "extraction_started");
          return created;
        });
        stage = "preparation";
        let model = run.model;
        let sourceHash: string | null = null;
        try {
          let type: DocumentType;
          let proposals: Proposal[];
          let partial = false;
          if (input.mode === "manual") {
            type = input.type;
            proposals = Object.keys(fieldLabels[input.type]).map((key) => ({
              key,
              value: null,
              evidence: null,
              confidence: "needs_review",
            }));
          } else {
            let provider: DocumentAI;
            try {
              provider = ai();
              model = provider.model;
            } catch {
              throw new ExtractionFailure("unavailable");
            }
            let source: string;
            if (input.text) source = input.text;
            else {
              let bytes: Buffer;
              try {
                bytes = await storage().read(owned.objectKey, 20 * 1048576);
              } catch {
                throw new ExtractionFailure("unavailable");
              }
              if (
                createHash("sha256").update(bytes).digest("hex") !==
                owned.checksum
              )
                throw new ExtractionFailure("unreadable");
              source = await prepare(bytes, owned.mimeType);
            }
            sourceHash = createHash("sha256").update(source).digest("hex");
            const complete = async (
              inferenceStage: "classification" | "extraction",
              task: Parameters<DocumentAI["complete"]>[0],
            ) => {
              try {
                stage = inferenceStage;
                return await provider.complete(task);
              } catch (error) {
                console.error(
                  "extraction_inference_failed",
                  inferenceStage,
                  error instanceof InferenceError ? error.code : "unknown",
                  error instanceof InferenceError
                    ? (error.httpStatus ?? null)
                    : null,
                );
                throw new ExtractionFailure(
                  error instanceof InferenceError && error.code === "timeout"
                    ? "timeout"
                    : error instanceof InferenceError &&
                        ["malformed", "incomplete", "too_large"].includes(
                          error.code,
                        )
                      ? "malformed"
                      : "unavailable",
                );
              }
            };
            let classification;
            if (input.type)
              classification = {
                type: input.type,
                evidence: null,
                confidence: "needs_review" as const,
              };
            else {
              const raw = await complete(
                "classification",
                classificationPrompt(source),
              );
              try {
                classification = parseClassification(raw, source);
              } catch {
                console.error("extraction_output_invalid", "classification");
                throw new ExtractionFailure("malformed");
              }
            }
            type = classification.type;
            proposals = [
              {
                key: "document_type",
                value: type,
                evidence: classification.evidence,
                confidence: classification.confidence,
              },
            ];
            // Ambiguous classification never chooses a field schema without the worker.
            if (
              type !== "other" &&
              (input.type ||
                !["low", "needs_review"].includes(classification.confidence))
            ) {
              const raw = await complete(
                "extraction",
                extractionPrompt(source, type),
              );
              try {
                const parsed = parseFields(raw, type, source);
                proposals.push(...parsed);
                partial = parsed.partial;
              } catch {
                console.error("extraction_output_invalid", "extraction");
                throw new ExtractionFailure("malformed");
              }
            }
          }
          stage = "result_persistence";
          const saved = await persistAttempt(db, userId, documentId, {
            runId: run.id,
            model,
            sourceHash,
            result: { type, proposals, partial },
          });
          if (saved[0]?.status !== "ready")
            throw new DocumentError(
              "This attempt expired or the document is no longer available. Refresh and retry.",
              409,
            );
        } catch (error) {
          if (error instanceof DocumentError) throw error;
          if (!(
            error instanceof ContentError || error instanceof ExtractionFailure
          ))
            console.error(
              "extraction_pipeline_failed",
              stage,
              extractionDatabaseCode(error),
            );
          const code =
            error instanceof ContentError || error instanceof ExtractionFailure
              ? error.code
              : stage === "result_persistence"
                ? "persistence"
                : "interrupted";
          stage = "failure_persistence";
          try {
            await persistAttempt(db, userId, documentId, {
              runId: run.id,
              model,
              sourceHash,
              errorCode: code,
            });
          } catch (persistenceError) {
            console.error(
              "extraction_failure_persistence_failed",
              code,
              extractionDatabaseCode(error),
              extractionDatabaseCode(persistenceError),
            );
            throw persistenceError;
          }
        }
        stage = "read_result";
        return await this.read(userId, documentId, run.id);
      } catch (error) {
        if (!(error instanceof DocumentError))
          console.error(
            "extraction_start_failed",
            stage,
            extractionDatabaseCode(error),
          );
        throw error;
      }
    },
    async review(userId: string, documentId: string, raw: unknown) {
      const input = reviewSchema.parse(raw);
      const runId = await db.$transaction(async (tx) => {
        const doc = await document(tx, userId, documentId, true);
        const field = await tx.extractedField.findFirst({
          where: {
            id: input.fieldId,
            extraction: { documentId, userId, status: "ready" },
          },
        });
        if (!field) throw new DocumentError("Field not found.", 404);
        if (input.action === "confirm" && !field.proposedValue)
          throw new DocumentError(
            "No proposal to confirm. Enter a value or mark unknown.",
            422,
          );
        const value =
          input.action === "correct"
            ? input.value!
            : input.action === "confirm"
              ? field.proposedValue
              : null;
        if (
          field.key === "document_type" &&
          value &&
          ![...supportedTypes, "other"].includes(value as ExtractionType)
        )
          throw new DocumentError("Choose a supported document category.", 422);
        const reviewState = {
          confirm: "confirmed",
          correct: "corrected",
          reject: "rejected",
          unknown: "unknown",
        } as const;
        const changed = await tx.extractedField.updateMany({
          where: { id: field.id, version: input.version },
          data: {
            value,
            reviewState: reviewState[input.action],
            version: { increment: 1 },
          },
        });
        if (!changed.count)
          throw new DocumentError(
            "This field changed in another tab. Refresh before reviewing it.",
            409,
          );
        await tx.extractionFieldRevision.create({
          data: { fieldId: field.id, state: reviewState[input.action], value },
        });
        await audit(tx, doc, "extraction_reviewed");
        return field.extractionId;
      });
      return this.read(userId, documentId, runId);
    },
  };
}
