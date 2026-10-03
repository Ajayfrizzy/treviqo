"use client";
import { getCsrfToken, signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
export function CredentialsForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get("email") ?? "");
    const password = String(values.get("password") ?? "");
    try {
      if (register) {
        const response = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
        if (!response.ok) { setError("Unable to create an account with these details. Try signing in or use different details."); return; }
        form.reset(); setCreated(true);
      } else {
        const response = await signIn("credentials", { email, password, redirect: false });
        if (!response?.ok || response.error) { setError("Unable to sign in. Check your details or try again later."); return; }
        router.replace("/"); router.refresh();
      }
    } catch { setError("We could not complete your request. Please try again."); }
    finally { setBusy(false); }
  }
  if (created) return <div role="status"><p>Your account is ready.</p><Link href="/sign-in">Sign in to Treviqo</Link></div>;
  return <form className="auth-form" onSubmit={submit} aria-busy={busy}>
    <label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required aria-describedby={error ? "auth-error" : undefined} />
    <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={15} maxLength={128} required aria-describedby={register ? "password-hint auth-error" : "auth-error"} />
    {register && <p id="password-hint">Use a passphrase of 15–128 characters. Spaces are welcome.</p>}
    <p id="auth-error" role={error ? "alert" : undefined}>{error}</p>
    <button disabled={busy} type="submit">{busy ? "Please wait…" : register ? "Create account" : "Sign in securely"}</button>
    <Link href={register ? "/sign-in" : "/register"}>{register ? "Already have an account? Sign in" : "Create an account"}</Link>
  </form>;
}
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true); setError("");
    try {
      const csrfToken = await getCsrfToken();
      if (!csrfToken) throw new Error("Unavailable");
      const response = await fetch("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, callbackUrl: "/sign-in", json: "true" }) });
      if (!response.ok) throw new Error("Unavailable");
      router.replace("/sign-in"); router.refresh();
    } catch { setError("Sign-out could not complete. Please try again."); setBusy(false); }
  }
  return <><button className="secondary" disabled={busy} onClick={() => void logout()}>{busy ? "Signing out…" : "Sign out"}</button>{error && <p role="alert">{error}</p>}</>;
}
