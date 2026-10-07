import { deletionDateLabel } from "@/modules/account/shared";
import {
  pendingDeletionDate,
  signInErrorMessage,
  SIGN_IN_UNAVAILABLE,
} from "@/modules/auth/sign-in-state";
import { authConfigured } from "@/modules/auth/options";
import { CredentialsForm } from "@/components/auth-actions";
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
  const { error, account, scheduledFor } = await searchParams;
  const scheduled = pendingDeletionDate(
    `DeletionPending:${scheduledFor ?? ""}`,
  );
  return (
    <main id="main" className="welcome">
      <div className="wordmark">
        treviqo<span className="brand-dot">.</span>
      </div>
      <p className="eyebrow">Made for your next chapter</p>
      <h1>
        Your working life.
        <br />
        Yours to keep.
      </h1>
      <p className="intro">
        Your employment and benefits history belongs to you. Keep it together,
        wherever work takes you.
      </p>
      <section className="card">
        <h2>Welcome to Treviqo</h2>
        {account === "scheduled" && scheduled && (
          <div role="status">
            <h2>Account deletion scheduled</h2>
            <p>
              Your account has been disabled and is scheduled for permanent
              deletion on {deletionDateLabel(scheduled)}. You have been signed
              out on all devices.
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
            <p>Sign in to your personal space.</p>
            <CredentialsForm />
          </>
        ) : (
          <p role="status">{SIGN_IN_UNAVAILABLE}</p>
        )}
      </section>
      <p className="quiet">Employment · Benefits · Continuity</p>
    </main>
  );
}
