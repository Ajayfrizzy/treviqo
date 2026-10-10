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
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "@/components/action-link";
import { useRouter } from "next/navigation";
import {
  registrationSchema,
  signInSchema,
  passwordRequirements,
} from "@/modules/auth/validation";
import { ProfileFields } from "./profile-fields";
export function CredentialsForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const fallback = useRef<HTMLDivElement>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [created, setCreated] = useState(false);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [processingDeletion, setProcessingDeletion] = useState(false);
  const [cancelDeletion, setCancelDeletion] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (created) fallback.current?.focus();
  }, [created]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || created) return;
    setError("");
    setFieldErrors({});
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get("email") ?? "");
    const password = String(values.get("password") ?? "");
    const parsed = register
      ? registrationSchema.safeParse(Object.fromEntries(values))
      : signInSchema.safeParse({ email, password });
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
    submitting.current = true;
    setBusy(true);
    let accountCreated = false;
    try {
      if (register) {
        const response = await uiRequest("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
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
        accountCreated = true;
        setSettingUp(true);
        form.reset();
        setPassword("");
        setVisible(false);
        const authResponse = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        if (!authResponse?.ok || authResponse.error) {
          setCreated(true);
          return;
        }
        router.replace("/home");
        router.refresh();
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
        router.replace("/home");
        router.refresh();
      }
    } catch {
      if (accountCreated) {
        setCreated(true);
        return;
      }
      setError(
        register
          ? "We could not complete your request. Please try again."
          : SIGN_IN_UNAVAILABLE,
      );
    } finally {
      if (!accountCreated) {
        submitting.current = false;
        setBusy(false);
      }
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
      <div ref={fallback} tabIndex={-1} role="status" className="auth-success">
        <h2>Account created</h2>
        <p>
          Your account was created, but automatic sign-in could not be
          completed. Sign in to continue to your Treviqo space.
        </p>
        <Link className="button-link" href="/sign-in">
          Sign in
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
      {register && (
        <ProfileFields
          requiredNames
          fields="names"
          errors={fieldErrors}
          disabled={busy}
          onChange={(name) =>
            setFieldErrors((previous) => ({ ...previous, [name]: "" }))
          }
        />
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
      {register && (
        <fieldset className="optional-profile" disabled={busy}>
          <legend>
            Make it yours <span className="optional">(optional)</span>
          </legend>
          <ProfileFields
            fields="optional"
            errors={fieldErrors}
            disabled={busy}
            onChange={(name) =>
              setFieldErrors((previous) => ({ ...previous, [name]: "" }))
            }
          />
        </fieldset>
      )}
      {error && (
        <p id="auth-error" className="form-message" role="alert">
          {error}
        </p>
      )}
      <Button disabled={busy} aria-busy={busy} type="submit">
        {settingUp
          ? "Setting up your Treviqo space…"
          : busy
            ? register
              ? "Creating account…"
              : cancelDeletion
                ? "Cancelling deletion…"
                : "Signing in…"
            : register
              ? "Create account"
              : cancelDeletion
                ? "Verify and cancel deletion"
                : "Sign in securely"}
      </Button>
      {busy && (
        <p role="status" className={register ? undefined : "sr-only"}>
          {settingUp
            ? "Setting up your Treviqo space…"
            : register
              ? "Creating your personal space…"
              : cancelDeletion
                ? "Cancelling deletion…"
                : "Signing in…"}
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
