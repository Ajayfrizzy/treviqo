import { authConfigured } from "@/modules/auth/options";
import { CredentialsForm } from "@/components/auth-actions";
export const dynamic = "force-dynamic";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  let configured = false;
  try {
    configured = authConfigured();
  } catch {
    /* Fail closed; never expose configuration. */
  }
  const { error } = await searchParams;
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
        {error && (
          <p role="alert">We could not complete sign-in. Please try again.</p>
        )}
        {configured ? (
          <>
            <p>Sign in to your personal space.</p>
            <CredentialsForm />
          </>
        ) : (
          <p role="status">
            Sign-in is being prepared. Please check back soon.
          </p>
        )}
      </section>
      <p className="quiet">Employment · Benefits · Continuity</p>
    </main>
  );
}
