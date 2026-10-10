import { SignOutButton } from "@/components/auth-actions";
import { employmentPageUser } from "@/modules/employments/page-user";
import { SESSION_SECONDS } from "@/modules/auth/session-store";
import { getProfile } from "@/modules/profile/service";
import { displayName, countries } from "@/modules/profile/shared";
import { ProfileForm } from "@/components/profile-form";
import { DeleteAccount } from "@/components/delete-account";
export default async function Profile() {
  const user = await employmentPageUser();
  const account = await getProfile(user.id);
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
            <dt>Display name</dt>
            <dd>{displayName(account) ?? "Not specified"}</dd>
            <dt>First name</dt>
            <dd>{account.firstName ?? "Not specified"}</dd>
            <dt>Last name</dt>
            <dd>{account.lastName ?? "Not specified"}</dd>
            <dt>Preferred name</dt>
            <dd>{account.preferredName ?? "Not specified"}</dd>
            <dt>Country or territory</dt>
            <dd>
              {countries.find((country) => country.code === account.country)
                ?.label ?? "Not specified"}
            </dd>
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
      <section className="card history" aria-labelledby="edit-profile-title">
        <h2 id="edit-profile-title">Edit personal details</h2>
        <p>
          Your preferred name is used for greetings. Email remains your sign-in
          identifier.
        </p>
        <ProfileForm initial={account} />
      </section>
      <DeleteAccount />
    </>
  );
}
