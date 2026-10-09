"use client";
import { Button } from "./button";
import { uiRequest } from "./ui-request";
import Link from "@/components/action-link";
import { useState } from "react";
interface Data {
  updatesAvailable: boolean;
  reminders: {
    id: string;
    version: number;
    kind: string;
    title: string;
    message: string;
    href: string;
    dueAt: string;
  }[];
}
export function Reminders({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function request(input?: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await uiRequest("/api/reminders", {
        cache: "no-store",
        method: input ? "POST" : "GET",
        headers: input ? { "content-type": "application/json" } : undefined,
        body: input ? JSON.stringify(input) : undefined,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Please retry.");
      setData(body);
      setSuccess(
        input
          ? "Reminder updated. This does not resolve the underlying action."
          : "Reminders refreshed.",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="touch-link" href="/">
        ← Home
      </Link>
      <h1>Your reminders</h1>
      <p className="intro">
        Follow up on your existing exit actions and records.
      </p>
      <p>
        These are in-app prompts, not legal deadlines. Review source records
        before acting. No email or push notification is sent.
      </p>
      <Button
        pendingLabel="Refreshing…"
        className="secondary"
        disabled={busy}
        onClick={() => request()}
      >
        Refresh reminders
      </Button>
      {!data.updatesAvailable && (
        <p role="status">
          Background updates are delayed. Existing reminders are checked against
          current records below; review your exit checklist for newly
          outstanding actions.
        </p>
      )}
      {success && <p role="status">{success}</p>}
      {error && (
        <p role="alert">
          {error} Displayed reminders are from the last successful load.
        </p>
      )}
      {!data.reminders.length ? (
        <section className="card history">
          <h2>No reminders due</h2>
          <p>
            New cases are checked in the background. Snoozing or dismissing a
            reminder does not confirm completion.
          </p>
          <Link className="touch-link" href="/exit">
            Review exit checklists
          </Link>
        </section>
      ) : (
        <div className="passport-flow history">
          {data.reminders.map((item) => (
            <article className="card" key={item.id}>
              <span className="badge">{item.kind.replaceAll("_", " ")}</span>
              <h2>{item.title}</h2>
              <p>{item.message}</p>
              <p>Follow-up date: {item.dueAt.slice(0, 10)}</p>
              <Link className="touch-link" href={item.href}>
                Review current records
              </Link>
              <div className="form-actions">
                <Button
                  pendingLabel="Snoozing…"
                  disabled={busy}
                  onClick={() =>
                    request({
                      id: item.id,
                      version: item.version,
                      action: "snooze",
                    })
                  }
                >
                  Remind me in 7 days
                </Button>
                <Button
                  pendingLabel="Dismissing…"
                  disabled={busy}
                  className="secondary"
                  onClick={() =>
                    request({
                      id: item.id,
                      version: item.version,
                      action: "dismiss",
                    })
                  }
                >
                  Dismiss this prompt
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
