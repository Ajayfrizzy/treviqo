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
export const DELETION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const deletionDeadline = (now: Date) =>
  new Date(now.getTime() + DELETION_GRACE_MS);
export const deletionUnavailable =
  "Account deletion could not be scheduled. Please try again shortly.";
export function deletionDateLabel(value: string) {
  return (
    new Intl.DateTimeFormat("en-NG", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Africa/Lagos",
    }).format(new Date(value)) + " (West Africa Time)"
  );
}
