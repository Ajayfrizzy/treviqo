export const INVALID_CREDENTIALS = "Email or password is incorrect.";
export const SIGN_IN_UNAVAILABLE =
  "Sign-in is temporarily unavailable. Please try again shortly.";
export class CredentialStateError extends Error {}
export function signInErrorMessage(error: string | null | undefined) {
  return error === "CredentialsSignin"
    ? INVALID_CREDENTIALS
    : SIGN_IN_UNAVAILABLE;
}
export function pendingDeletionDate(
  error: string | null | undefined,
): string | null {
  if (!error?.startsWith("DeletionPending:")) return null;
  const value = error.slice("DeletionPending:".length);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? value
    : null;
}
