import { CredentialsForm } from "@/components/auth-actions";
import { authConfigured } from "@/modules/auth/options";
export const dynamic = "force-dynamic";
export default function Register() {
  let configured = false;
  try {
    configured = authConfigured();
  } catch {
    /* Fail closed without exposing configuration. */
  }
  return (
    <main id="main" className="welcome">
      <div className="wordmark">
        treviqo<span className="brand-dot">.</span>
      </div>
      <p className="eyebrow">Your records, your next chapter</p>
      <h1>Create your account</h1>
      <p className="intro">
        Keep your employment and benefits history together, wherever work takes
        you.
      </p>
      <section className="card">
        {configured ? (
          <CredentialsForm register />
        ) : (
          <p role="status">
            Registration is being prepared. Please check back soon.
          </p>
        )}
      </section>
    </main>
  );
}
