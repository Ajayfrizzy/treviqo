"use client";
import {
  pendingDeletionDate,
  signInErrorMessage,
  SIGN_IN_UNAVAILABLE,
} from "@/modules/auth/sign-in-state";
import { deletionDateLabel } from "@/modules/account/shared";
import { Button } from "./button";
import { uiRequest } from "./ui-request";
import { getCsrfToken, signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";
import Link from "@/components/action-link";
import { useRouter } from "next/navigation";
import {
  credentialsSchema,
  signInSchema,
  passwordRequirements,
} from "@/modules/auth/validation";
export function CredentialsForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [processingDeletion, setProcessingDeletion] = useState(false);
  const [cancelDeletion, setCancelDeletion] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setFieldErrors({});
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get("email") ?? "");
    const password = String(values.get("password") ?? "");
    const parsed = (register ? credentialsSchema : signInSchema).safeParse({
      email,
      password,
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        errors[String(issue.path[0])] ??=
          issue.path[0] === "password" && register
            ? "Complete the password requirements below."
            : issue.message;
      setFieldErrors(errors);
      (
        form.elements.namedItem(
          Object.keys(errors)[0] ?? "email",
        ) as HTMLInputElement
      )?.focus();
      return;
    }
    setBusy(true);
    try {
      if (register) {
        const response = await uiRequest("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          setError(
            response.status === 429
              ? "Too many attempts. Wait a minute, then try again."
              : response.status >= 500
                ? "Registration is temporarily unavailable. Please try again shortly."
                : "Unable to create an account with these details. Try signing in or use different details.",
          );
          return;
        }
        form.reset();
        setPassword("");
        setCreated(true);
      } else {
        const response = await signIn("credentials", {
          email,
          password,
          redirect: false,
          cancelDeletion: cancelDeletion ? "true" : "false",
        });
        if (!response?.ok || response.error) {
          const scheduledFor = pendingDeletionDate(response?.error);
          if (scheduledFor || response?.error === "DeletionProcessing") {
            setVerifiedEmail(email);
            setPassword("");
            setPendingDate(scheduledFor);
            setProcessingDeletion(response?.error === "DeletionProcessing");
            setCancelDeletion(false);
          } else {
            setError(signInErrorMessage(response?.error));
          }
          return;
        }
        router.replace("/");
        router.refresh();
      }
    } catch {
      setError(
        register
          ? "We could not complete your request. Please try again."
          : SIGN_IN_UNAVAILABLE,
      );
    } finally {
      setBusy(false);
    }
  }
  if ((pendingDate || processingDeletion) && !cancelDeletion)
    return (
      <section aria-labelledby="pending-deletion-title">
        <h2 id="pending-deletion-title">
          {processingDeletion
            ? "Account deletion is being processed"
            : "Account deletion scheduled"}
        </h2>
        {pendingDate && (
          <p>
            Your account is scheduled for deletion on{" "}
            {deletionDateLabel(pendingDate)}.
          </p>
        )}
        <p>Your account is currently disabled.</p>
        {processingDeletion ? (
          <p>
            The cancellation deadline has passed. Permanent cleanup is pending
            or in progress.
          </p>
        ) : (
          <>
            <p>
              You can cancel deletion before this date if you change your mind.
            </p>
            <Button
              onClick={() => {
                setCancelDeletion(true);
                setError("");
              }}
            >
              Cancel account deletion
            </Button>
          </>
        )}
        <p>
          <a className="touch-link" href="/sign-in">
            Leave account scheduled for deletion
          </a>
        </p>
      </section>
    );
  if (created)
    return (
      <div role="status" className="auth-success">
        <span className="badge">Account created</span>
        <h2>Your account is ready.</h2>
        <p>Sign in to start keeping your employment records together.</p>
        <Link className="button-link" href="/sign-in">
          Sign in to Treviqo
        </Link>
      </div>
    );
  return (
    <form className="auth-form" onSubmit={submit} noValidate aria-busy={busy}>
      {cancelDeletion && (
        <>
          <h2>Cancel account deletion</h2>
          <p>
            Verify your email and current password to restore access. A fresh
            session will be created after verification.
          </p>
        </>
      )}
      <div className="form-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          defaultValue={verifiedEmail}
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          required
          disabled={busy}
          onChange={() =>
            setFieldErrors((previous) => ({ ...previous, email: "" }))
          }
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
        />
        {fieldErrors.email && (
          <p id="email-error" className="field-error">
            {fieldErrors.email}
          </p>
        )}
      </div>
      <div className="form-field">
        <label htmlFor="password">Password</label>
        <div className="password-control">
          <input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete={register ? "new-password" : "current-password"}
            minLength={register ? 8 : 1}
            maxLength={128}
            required
            disabled={busy}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((previous) => ({ ...previous, password: "" }));
            }}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={
              [
                register ? "password-hint" : "",
                fieldErrors.password ? "password-error" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          />
          <Button
            type="button"
            className="password-toggle secondary"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-controls="password"
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? "Hide" : "Show"}
          </Button>
        </div>
        {fieldErrors.password && (
          <p id="password-error" className="field-error">
            {fieldErrors.password}
          </p>
        )}
      </div>
      {register && (
        <div id="password-hint" className="password-requirements">
          <p>Your password needs:</p>
          <ul>
            {passwordRequirements.map((requirement) => (
              <li key={requirement.label} data-met={requirement.test(password)}>
                <span aria-hidden="true">
                  {requirement.test(password) ? "✓" : "○"}
                </span>
                <span className="sr-only">
                  {requirement.test(password) ? "Met: " : "Needed: "}
                </span>
                {requirement.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p id="auth-error" className="form-message" role="alert">
          {error}
        </p>
      )}
      <Button disabled={busy} aria-busy={busy} type="submit">
        {busy
          ? register
            ? "Creating account…"
            : "Signing in…"
          : register
            ? "Create account"
            : cancelDeletion
              ? "Verify and cancel deletion"
              : "Sign in securely"}
      </Button>
      {busy && (
        <p role="status" className={register ? undefined : "sr-only"}>
          {register ? "Creating your personal space…" : "Signing in…"}
        </p>
      )}
      <Link
        className="auth-switch touch-link"
        href={register ? "/sign-in" : "/register"}
      >
        {register ? "Already have an account? Sign in" : "Create an account"}
      </Link>
    </form>
  );
}
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const csrfToken = await getCsrfToken();
      if (!csrfToken) throw new Error("Unavailable");
      const response = await uiRequest("/api/auth/signout", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          csrfToken,
          callbackUrl: "/sign-in",
          json: "true",
        }),
      });
      if (!response.ok) throw new Error("Unavailable");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Sign-out could not complete. Please try again.");
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        className="secondary"
        disabled={busy}
        aria-busy={busy}
        onClick={() => logout()}
      >
        {busy ? "Signing out…" : "Sign out"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
