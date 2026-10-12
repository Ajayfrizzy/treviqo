import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { DocumentError } from "@/modules/documents/validation";
import { retryIdempotentDatabaseOperation } from "@/server/db/retry";
import { EXTRACTION_LEASE_MS } from "./persistence";
import { PROMPT_VERSION, SCHEMA_VERSION } from "./schema";

export async function reserveExtraction(
  db: Pick<PrismaClient, "$queryRaw">,
  input: {
    id: string;
    userId: string;
    documentId: string;
    sourceKind: string;
    model: string;
  },
) {
  // Same operation ID on the single connectivity retry: an acknowledged-late
  // commit returns its existing attempt, with no second insert or audit event.
  const rows = await retryIdempotentDatabaseOperation(() =>
    db.$queryRaw<{ id: string; model: string }[]>(Prisma.sql`
    WITH observed AS MATERIALIZED (
      SELECT d."id", d.xmin AS version FROM "EmploymentDocument" d
      JOIN "Employment" e ON e."id" = d."employmentId" AND e."userId" = d."userId"
      WHERE d."id" = ${input.documentId} AND d."userId" = ${input.userId} AND d."status" = 'ready'
    ), previous AS MATERIALIZED (
      SELECT r."id", r."model" FROM "DocumentExtraction" r
      JOIN "EmploymentDocument" d ON d."id" = r."documentId" AND d."userId" = r."userId"
      JOIN "Employment" e ON e."id" = d."employmentId" AND e."userId" = d."userId"
      WHERE r."id" = ${input.id} AND r."documentId" = ${input.documentId}
        AND r."userId" = ${input.userId} AND d."status" = 'ready'
    ), owned AS (
      UPDATE "EmploymentDocument" d SET "status" = d."status"
      FROM observed WHERE d."id" = observed."id" AND d.xmin = observed.version
        AND d."userId" = ${input.userId} AND d."status" = 'ready'
        AND NOT EXISTS (SELECT 1 FROM previous)
        AND NOT EXISTS (
          SELECT 1 FROM "DocumentExtraction" r WHERE r."documentId" = d."id" AND r."userId" = d."userId"
          AND r."status" = 'processing' AND r."createdAt" >
            (clock_timestamp() AT TIME ZONE 'UTC') - (${EXTRACTION_LEASE_MS} * interval '1 millisecond')
        )
      RETURNING d."id", d."employmentId"
    ), expired AS (
      UPDATE "DocumentExtraction" r SET "status" = 'failed', "errorCode" = 'interrupted', "updatedAt" = clock_timestamp()
      FROM owned WHERE r."documentId" = owned."id" AND r."userId" = ${input.userId} AND r."status" = 'processing'
        AND r."createdAt" <= (clock_timestamp() AT TIME ZONE 'UTC') - (${EXTRACTION_LEASE_MS} * interval '1 millisecond')
      RETURNING r."id", owned."employmentId"
    ), inserted AS (
      INSERT INTO "DocumentExtraction" ("id", "documentId", "userId", "sourceKind", "model", "promptVersion", "schemaVersion", "createdAt", "updatedAt")
      SELECT ${input.id}, owned."id", ${input.userId}, ${input.sourceKind}, ${input.model}, ${PROMPT_VERSION}, ${SCHEMA_VERSION}, clock_timestamp(), clock_timestamp() FROM owned
      RETURNING "id", "model"
    ), audited AS (
      INSERT INTO "AuditEvent" ("id", "userId", "documentId", "employmentId", "action")
      SELECT ${input.id} || '-started', ${input.userId}, owned."id", owned."employmentId", 'extraction_started'::"AuditAction"
        FROM inserted CROSS JOIN owned
      UNION ALL
      SELECT ${input.id} || expired."id", ${input.userId}, ${input.documentId}, expired."employmentId", 'extraction_failed'::"AuditAction" FROM expired
    ) SELECT "id", "model" FROM inserted UNION ALL SELECT "id", "model" FROM previous
  `),
  );
  // The version predicate matters: a row lock alone does not refresh the
  // statement snapshot after a concurrent starter commits. PostgreSQL xmin
  // provides CAS without changing updatedAt (used by Passport evidence freshness).
  // This no-op tuple update prevents both
  // starters observing the old empty attempt list and inserting duplicates.
  if (!rows[0])
    throw new DocumentError(
      "An extraction is already running or the document changed. Refresh shortly.",
      409,
    );
  return rows[0];
}
