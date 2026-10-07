import "server-only";
import { Prisma } from "@prisma/client";

// Only SDK error codes, never messages, query metadata, documents or identifiers.
export function extractionDatabaseCode(error: unknown): string {
  const code =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code
      : error instanceof Prisma.PrismaClientInitializationError
        ? error.errorCode
        : undefined;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : "unknown";
}
