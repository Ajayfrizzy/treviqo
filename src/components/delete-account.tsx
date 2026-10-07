"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "./button";
import { uiRequest } from "./ui-request";
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await uiRequest(
        "/api/account",
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            password: values.get("password"),
            confirmation: values.get("confirmation"),
          }),
        },
        60000,
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ||
            "Deletion could not be scheduled. Please try again shortly.",
        );
      if (result.status !== "scheduled" || !result.deletionScheduledFor)
        throw new Error(
          "Deletion status is uncertain. Sign in again to check its status.",
        );
      // Discard private client/router state after server-side session revocation.
      window.location.replace(
        `/sign-in?account=scheduled&scheduledFor=${encodeURIComponent(result.deletionScheduledFor)}`,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Deletion could not be scheduled. Sign in again to check its status before retrying.",
      );
    } finally {
      form.reset();
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="card account-danger"
      aria-labelledby="delete-account-title"
    >
      <p className="eyebrow">Danger area</p>
      <h2 id="delete-account-title">Delete account</h2>
      <p>
        Your Treviqo account will be disabled immediately and scheduled for
        permanent deletion in 7 days. You can cancel before the scheduled
        deletion date.
      </p>
      <p>
        Sign in with your email and password before that date to cancel. All
        sessions will end when you confirm.
      </p>
      <p>
        Provider backups or retained processing copies may remain temporarily
        under their retention policies.
      </p>
      {!open ? (
        <Button className="danger-button" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      ) : (
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          <div className="form-field">
            <label htmlFor="delete-password">Current password</label>
            <input
              id="delete-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              disabled={busy}
            />
          </div>
          <div className="form-field">
            <label htmlFor="delete-confirmation">
              Type DELETE to schedule account deletion
            </label>
            <input
              id="delete-confirmation"
              name="confirmation"
              autoComplete="off"
              spellCheck={false}
              pattern="DELETE"
              required
              disabled={busy}
            />
          </div>
          {error && (
            <p role="alert" className="form-message">
              {error}
            </p>
          )}
          {busy && (
            <p role="status">
              Scheduling account deletion and ending all sessions…
            </p>
          )}
          <div className="account-danger-actions">
            <Button
              type="submit"
              className="danger-button"
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "Scheduling…" : "Schedule account deletion"}
            </Button>
            <Button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setError("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
