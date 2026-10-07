"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "./button";
import { uiRequest } from "./ui-request";
export function DeleteAccount({
  pending: initialPending,
}: {
  pending: boolean;
}) {
  const [open, setOpen] = useState(initialPending);
  const [pending, setPending] = useState(initialPending);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
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
            "Deletion could not finish. Return to Profile and retry.",
        );
      if (result.status === "deleted") {
        // Full navigation discards private React/router state; server already revoked
        // every session and cleared auth cookies in the successful response.
        window.location.replace("/sign-in?account=deleted");
        return;
      }
      if (result.status !== "pending")
        throw new Error(
          "Deletion status is uncertain. Refresh Profile before retrying.",
        );
      setPending(true);
      setMessage(
        "Some files have been removed. Re-enter your password and DELETE, then continue to finish deleting the remaining files and account.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Deletion could not finish. Refresh Profile to check its status before retrying.",
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
        This permanently removes your sign-in account, employment records,
        uploaded documents and their stored versions, extracted details and
        review history, exit cases, settlement and pension reviews, benefits,
        Passport data, reminders, and account activity records from Treviqo’s
        active systems. All devices will be signed out.
      </p>
      <p>
        Deletion cannot be undone. Save any records you need first. Downloaded
        copies, provider backups and any retained AI processing copies are
        outside this in-app cleanup and remain subject to their retention
        policies.
      </p>
      <p>
        If storage refuses deletion, we will not report success. Some files may
        already be removed; your account and cleanup records stay available so
        you can retry from Profile. New uploads are blocked once deletion
        starts.
      </p>
      {pending && (
        <p role="status">
          Account deletion has started but has not finished. Continue below to
          retry cleanup. Removed files cannot be restored.
        </p>
      )}
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
              Type DELETE to confirm permanent deletion
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
          {message && <p role="status">{message}</p>}
          {busy && (
            <p role="status">
              Removing your files and account. This may take up to a minute. Do
              not start another request.
            </p>
          )}
          <div className="account-danger-actions">
            <Button
              type="submit"
              className="danger-button"
              disabled={busy}
              aria-busy={busy}
            >
              {busy
                ? "Deleting…"
                : pending
                  ? "Continue account deletion"
                  : "Permanently delete account"}
            </Button>
            <Button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setError("");
                setMessage("");
              }}
            >
              {pending ? "Close form" : "Cancel"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
