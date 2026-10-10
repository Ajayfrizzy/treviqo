import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/session";
import { deletionDateLabel } from "@/modules/account/shared";
import {
  pendingDeletionDate,
  signInErrorMessage,
  SIGN_IN_UNAVAILABLE,
} from "@/modules/auth/sign-in-state";
import { authConfigured } from "@/modules/auth/options";
import { CredentialsForm } from "@/components/auth-actions";
import { AuthLayout } from "@/components/auth-layout";
export const dynamic = "force-dynamic";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    account?: string;
    scheduledFor?: string;
  }>;
}) {
  let configured = false;
  try {
    configured = authConfigured();
  } catch {
    /* Fail closed; never expose configuration. */
  }
  let signedIn = false;
  try {
    signedIn = configured && !!(await getCurrentUser());
  } catch {
    configured = false;
  }
  if (signedIn) redirect("/home");
  const { error, account, scheduledFor } = await searchParams;
  const scheduled = pendingDeletionDate(
    `DeletionPending:${scheduledFor ?? ""}`,
  );
  return (
    <AuthLayout
      title="Welcome back"
      intro="Sign in to continue your working-life record."
    >
      {account === "scheduled" && scheduled && (
        <div role="status">
          <h2>Account deletion scheduled</h2>
          <p>
            Your account has been disabled and is scheduled for permanent
            deletion on {deletionDateLabel(scheduled)}. You have been signed out
            on all devices.
          </p>
          <p>
            Sign in below to cancel before this date. Provider backups may
            remain temporarily under their retention policies.
          </p>
        </div>
      )}
      {error && <p role="alert">{signInErrorMessage(error)}</p>}
      {configured ? (
        <>
          <CredentialsForm />
        </>
      ) : (
        <p role="status">{SIGN_IN_UNAVAILABLE}</p>
      )}
    </AuthLayout>
  );
}
