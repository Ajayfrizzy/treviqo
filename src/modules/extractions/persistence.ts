import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type DocumentType } from "@prisma/client";

export const EXTRACTION_LEASE_MS = 120000;
export type Proposal = {
  key: string;
  value: string | null;
  evidence: string | null;
  confidence: "high" | "medium" | "low" | "needs_review";
};

// One statement is one atomic transaction: no interactive-transaction timer or
// client/database round trips while holding the document lock. The lock orders
// completion against reservation and deletion; the run predicate rejects stale work.
export async function persistAttempt(
  db: Pick<PrismaClient, "$queryRaw">,
  userId: string,
  documentId: string,
  input?: {
    runId: string;
    model: string;
    sourceHash: string | null;
    result?: { type: DocumentType; proposals: Proposal[]; partial: boolean };
    errorCode?: string;
  },
  now = new Date(),
) {
  const result = input?.result;
  const cutoff = new Date(now.getTime() - EXTRACTION_LEASE_MS);
  // Evaluate result leases at the write, after any document lock wait, using
  // the database clock rather than an application timestamp captured beforehand.
  const liveLease = Prisma.sql`r."createdAt" > (clock_timestamp() AT TIME ZONE 'UTC') - (${EXTRACTION_LEASE_MS} * interval '1 millisecond')`;
  const fields = JSON.stringify(
    (result?.proposals ?? []).map((p) => ({ ...p, id: randomUUID() })),
  );
  return db.$queryRaw<{ id: string; status: string }[]>(Prisma.sql`
    WITH owned AS MATERIALIZED (
      SELECT d."id", d."employmentId" FROM "EmploymentDocument" d
      JOIN "Employment" e ON e."id" = d."employmentId" AND e."userId" = d."userId"
      WHERE d."id" = ${documentId} AND d."userId" = ${userId} AND ${input ? Prisma.sql`d."status" = 'ready'` : Prisma.sql`TRUE`}
      AND ${
        input
          ? Prisma.sql`TRUE`
          : Prisma.sql`EXISTS (
        SELECT 1 FROM "DocumentExtraction" r WHERE r."documentId" = d."id"
          AND r."userId" = ${userId} AND r."status" = 'processing' AND r."createdAt" <= ${cutoff}
      )`
      }
      FOR UPDATE OF d
    ), changed AS (
      UPDATE "DocumentExtraction" r SET
        "status" = CASE WHEN ${!!result} AND ${liveLease}
          THEN 'ready' ELSE 'failed' END::"ExtractionStatus",
        "errorCode" = CASE WHEN ${!!result} AND ${liveLease}
          THEN ${result?.partial ? "partial" : null}
          ELSE ${input?.errorCode ?? "interrupted"} END,
        "documentType" = COALESCE(${result?.type ?? null}::"DocumentType", r."documentType"),
        "model" = COALESCE(${input?.model ?? null}, r."model"),
        "sourceHash" = COALESCE(${input?.sourceHash ?? null}, r."sourceHash"),
        "updatedAt" = clock_timestamp()
      FROM owned WHERE r."documentId" = owned."id" AND r."userId" = ${userId}
        AND r."status" = 'processing'
        AND ${input ? Prisma.sql`r."id" = ${input.runId}` : Prisma.sql`r."createdAt" <= ${cutoff}`}
      RETURNING r."id", r."status", owned."employmentId"
    ), saved_fields AS (
      INSERT INTO "ExtractedField" (
        "id", "extractionId", "key", "proposedValue", "evidence", "confidence", "updatedAt"
      ) SELECT f.id, c."id", f.key, f.value, f.evidence,
        f.confidence::"ExtractionConfidence", clock_timestamp()
      FROM changed c CROSS JOIN jsonb_to_recordset(${fields}::jsonb)
        AS f(id text, key text, value text, evidence text, confidence text)
      WHERE c."status" = 'ready'
    ), audited AS (
      INSERT INTO "AuditEvent" ("id", "userId", "documentId", "employmentId", "action")
      SELECT ${randomUUID()} || c."id", ${userId}, ${documentId}, c."employmentId",
        CASE WHEN c."status" = 'ready' THEN 'extraction_completed'
          ELSE 'extraction_failed' END::"AuditAction"
      FROM changed c
    ) SELECT "id", "status" FROM changed
  `);
}

// Existing worker outbox retries outages. A bounded batch prevents abandoned
// attempts staying processing when no owner opens their review page again.
export async function reapExpiredAttempts(db: PrismaClient, now: Date) {
  const rows = await db.documentExtraction.findMany({
    where: {
      status: "processing",
      createdAt: { lte: new Date(now.getTime() - EXTRACTION_LEASE_MS) },
    },
    select: { documentId: true, userId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 20,
  });
  for (const row of rows)
    await persistAttempt(db, row.userId, row.documentId, undefined, now);
  return rows.length === 20;
}
