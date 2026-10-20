import "server-only";
import { Prisma } from "@prisma/client";
import { DocumentError } from "@/modules/documents/validation";
export const DATABASE_UNAVAILABLE_MESSAGE =
  "Treviqo temporarily lost connection to the database. Please retry.";
export class DatabaseUnavailableError extends DocumentError {
  constructor() {
    super(DATABASE_UNAVAILABLE_MESSAGE, 503);
  }
}
export function transientDatabaseError(error: unknown): boolean {
  if (error instanceof DatabaseUnavailableError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return ["P1001", "P1017"].includes(error.code);
  if (error instanceof Prisma.PrismaClientInitializationError)
    return ["P1001", "P1017"].includes(error.errorCode ?? "");
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return (
    typeof code === "string" &&
    ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT"].includes(code)
  );
}
async function boundedRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // A wrapped failure has already exhausted its budget; never nest retries.
      if (error instanceof DatabaseUnavailableError) throw error;
      if (!transientDatabaseError(error)) throw error;
      if (attempt === 1) throw new DatabaseUnavailableError();
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}
export const readDatabase = boundedRetry;
// Call only with a fixed unique operation ID AND conditional/atomic writes.
export const retryIdempotentDatabaseOperation = boundedRetry;
