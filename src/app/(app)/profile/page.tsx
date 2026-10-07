import { SignOutButton } from "@/components/auth-actions";
import { employmentPageUser } from "@/modules/employments/page-user";
import { SESSION_SECONDS } from "@/modules/auth/session-store";
import { getDb } from "@/server/db/client";
import { DeleteAccount } from "@/components/delete-account";
export default async function Profile() {
  const user = await employmentPageUser();
  const account = await getDb().user.findUniqueOrThrow({
    where: { id: user.id },
    select: { email: true },
  });
  return (
    <>
      <p className="eyebrow">Your Treviqo</p>
      <h1>Profile</h1>
      <p className="intro">
        Your account and the space you keep your working life in.
      </p>
      <div className="profile-grid">
        <section className="card">
          <span className="badge">Signed in</span>
          <h2>Your account</h2>
          <dl className="employment-details">
            <dt>Signed-in email</dt>
            <dd>{account.email ?? "Email not available"}</dd>
            <dt>Account security</dt>
            <dd>Password-protected account</dd>
            <dt>Email status</dt>
            <dd>Email verification is not available yet.</dd>
          </dl>
          <p className="field-hint">Your email is your sign-in identifier.</p>
        </section>
        <section className="card">
          <h2>Your session</h2>
          <p>
            You are signed in on this browser. Sessions last up to{" "}
            {SESSION_SECONDS / 3600 === 8 ? "eight" : SESSION_SECONDS / 3600}{" "}
            hours from sign-in.
          </p>
          <p>
            Signing out ends this browser’s session. Sessions on other browsers
            and devices stay active.
          </p>
          <p className="field-hint">
            Using a shared device? Sign out when you finish.
          </p>
          <SignOutButton />
        </section>
      </div>
      <DeleteAccount />
    </>
  );
}
