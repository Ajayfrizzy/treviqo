import { z } from "zod";
import { signInSchema } from "@/modules/auth/validation";
export const deleteAccountSchema = z
  .object({
    password: signInSchema.shape.password,
    confirmation: z.literal("DELETE"),
  })
  .strict();
export class AccountDeletionError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export const deletionUnavailable =
  "Account deletion could not finish. Some files may already have been removed. Your account and cleanup records remain. Return to Profile and retry with your password. If this continues, ask Treviqo support to check storage permissions; do not assume your files were deleted.";
