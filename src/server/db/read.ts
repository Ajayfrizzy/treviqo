import "server-only";
import { DocumentError } from "@/modules/documents/validation";

// Preserve domain/ownership errors, but never propagate provider diagnostics
// into page rendering or API error messages. Existing retry boundaries handle 503.
export async function readRecords<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    throw new DocumentError(
      "Your records could not load. Please try again in a moment.",
      503,
    );
  }
}
