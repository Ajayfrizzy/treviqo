import Link from "next/link";
import { CredentialsForm } from "@/components/auth-actions";
import { authConfigured } from "@/modules/auth/options";
export const dynamic = "force-dynamic";
export default function Register() {
  let configured = false;
  try { configured = authConfigured(); } catch { /* Fail closed without exposing configuration. */ }
  return <main id="main" className="welcome"><div className="wordmark">treviqo<span className="brand-dot">.</span></div><h1>Create your account</h1><section className="card">{configured ? <CredentialsForm register /> : <p role="status">Registration is being prepared. Please check back soon.</p>}</section><p><Link href="/sign-in">Back to sign in</Link></p></main>;
}
