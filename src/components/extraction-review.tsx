"use client";
import { Button } from "./button";
import { useRouter } from "next/navigation";
import { uiRequest } from "./ui-request";
import { useRef, useState } from "react";
import { documentTypes } from "@/modules/documents/shared";
import {
  failureMessages,
  labelFor,
  supportedTypes,
  type ExtractionRecord,
  type ReviewField,
} from "@/modules/extractions/shared";
type Bundle = {
  extraction: ExtractionRecord | null;
  attempts: { id: string; status: string; createdAt: string }[];
};
export function ExtractionReview({
  documentId,
  initial,
}: {
  documentId: string;
  initial: Bundle;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [text, setText] = useState("");
  const [type, setType] = useState("");
  const [operation, setOperation] = useState("");
  const [newAttempt, setNewAttempt] = useState<
    "ai" | "manual" | "uncertain" | null
  >(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inFlight = useRef(false);
  const current = newAttempt ? null : data.extraction;
  const latest = data.attempts[0];
  const historical = !!current && !!latest && current.id !== latest.id;
  const previous = newAttempt ? data.attempts : data.attempts.slice(1);
  async function request(
    method: "GET" | "POST" | "PATCH",
    body?: unknown,
    runId?: string,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (method === "POST") {
      setNewAttempt((body as { mode: "ai" | "manual" }).mode);
      setHistoryOpen(false);
    }
    setOperation(
      method === "GET"
        ? "Loading the latest review…"
        : method === "PATCH"
          ? "Saving your review…"
          : (body as { mode?: string })?.mode === "manual"
            ? "Preparing fields for manual entry…"
            : "Processing your document. Extraction can take up to 90 seconds. Keep this page open, or return later and refresh the review.",
    );
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await uiRequest(
        `/api/documents/${documentId}/extractions${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`,
        {
          method,
          headers:
            method !== "GET"
              ? { "content-type": "application/json" }
              : undefined,
          body: body ? JSON.stringify(body) : undefined,
        },
        120000,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Please retry.");
      setData(result);
      setNewAttempt(null);
      // Classification/review can change records in prefetched destinations.
      if (method !== "GET") router.refresh();
      if (method === "PATCH") setMessage("Review saved.");
      if (method === "POST" && result.extraction?.status === "ready")
        setMessage(
          "Details are ready for your review. Nothing is confirmed automatically.",
        );
    } catch (error) {
      if (method === "POST") setNewAttempt("uncertain");
      setError(error instanceof Error ? error.message : "Please retry.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const remaining =
    current?.fields.filter((field) => field.reviewState === "proposed")
      .length ?? 0;
  return (
    <div className="extraction-flow" aria-busy={busy}>
      <section className="card">
        <h2>Your evidence, your confirmation</h2>
        <p>
          AI can miss or misread details. Compare every proposal with the source
          document. Confirmed details stay in this review; they do not change
          your employment record or decide any entitlement.
        </p>
      </section>
      {error && (
        <p role="alert" className="form-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      {busy && !newAttempt && (
        <p role="status" className="form-message">
          {operation}
        </p>
      )}
      {!current && !newAttempt && (
        <section className="card">
          <h2>No extracted details yet</h2>
          <p>
            Extract proposals from a text-based PDF, or choose a document type
            and enter the details yourself.
          </p>
        </section>
      )}
      <section className="card employment-form">
        <h2>{current ? "New attempt or manual entry" : "Start your review"}</h2>
        <p>
          Extraction sends readable text to Rumpty AI. Contracts, payslips,
          resignation/termination letters, final settlements and pension
          statements are supported. Pension review supports three separate
          entries per attempt; confirm coverage and completeness yourself.
          Earlier attempts and reviews are preserved.
        </p>
        <fieldset disabled={busy}>
          <label htmlFor="extract-type">Document type</label>
          <select
            id="extract-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Let AI suggest the type</option>
            {supportedTypes.map((value) => (
              <option key={value} value={value}>
                {documentTypes[value]}
              </option>
            ))}
          </select>
          <details>
            <summary>Scanned file or image? Add text from the document</summary>
            <label htmlFor="source-transcript">Document text (optional)</label>
            <textarea
              id="source-transcript"
              rows={7}
              maxLength={18000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-describedby="source-hint"
            />
            <p id="source-hint" className="field-hint">
              Paste 20–18,000 characters copied from this document. This is
              recorded as your transcription, not verified PDF text. Omit
              passwords, PINs, and banking credentials. Scans and photos are not
              read automatically.
            </p>
          </details>
          <div className="document-actions">
            <Button
              onClick={() =>
                request("POST", {
                  mode: "ai",
                  ...(type ? { type } : {}),
                  ...(text ? { text } : {}),
                })
              }
            >
              Extract details
            </Button>
            <Button
              className="secondary"
              onClick={() => {
                if (!type) {
                  setError("Choose a document type for manual entry.");
                  return;
                }
                return request("POST", { mode: "manual", type });
              }}
            >
              Enter details manually
            </Button>
          </div>
        </fieldset>
      </section>
      {newAttempt && (
        <section className="card" aria-label="Current attempt">
          <h2>
            {newAttempt === "ai"
              ? "Extracting details…"
              : newAttempt === "manual"
                ? "Preparing manual entry…"
                : "Check the latest attempt"}
          </h2>
          <p role="status">
            {newAttempt === "ai"
              ? "This may take up to 90 seconds."
              : newAttempt === "manual"
                ? "Preparing fields for your review."
                : "The new attempt’s outcome could not be confirmed. Refresh the review before trying again. Earlier attempts are in history."}
          </p>
        </section>
      )}
      {(data.attempts.length > 0 || newAttempt === "uncertain") && (
        <section
          className="card employment-form review-attempt"
          aria-label="Attempt history"
        >
          {!newAttempt && latest && (
            <p>Current attempt · {attemptLabel(latest)}</p>
          )}
          <Button
            className="secondary"
            disabled={busy}
            onClick={() => request("GET")}
          >
            {historical ? "Return to current attempt" : "Refresh review"}
          </Button>
          {previous.length > 0 && (
            <details
              open={historyOpen}
              onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
            >
              <summary>View previous attempts</summary>
              <ul className="attempt-history-list" role="list">
                {previous.map((attempt) => (
                  <li key={attempt.id}>
                    <Button
                      className="secondary"
                      disabled={busy}
                      aria-pressed={current?.id === attempt.id}
                      onClick={() => request("GET", undefined, attempt.id)}
                    >
                      {attemptLabel(attempt)}
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
      {current && (
        <section
          className="card"
          aria-label={historical ? "Previous attempt" : "Current attempt"}
        >
          {historical && (
            <p className="eyebrow">
              Previous attempt · {attemptDate(current.createdAt)} WAT
            </p>
          )}
          <h2>
            {current.status === "failed"
              ? "Extraction failed"
              : current.status === "processing"
                ? "Extracting details…"
                : current.errorCode === "partial"
                  ? "Some details were extracted"
                  : "Review status"}
          </h2>
          {current.status === "failed" ? (
            <p role={historical ? undefined : "alert"}>
              {failureMessages[current.errorCode ?? ""] ??
                failureMessages.interrupted}
            </p>
          ) : current.status === "processing" ? (
            <p role="status">
              This may take up to 90 seconds. Refresh shortly to see the result.
            </p>
          ) : (
            <p>
              {remaining
                ? `${remaining} fields waiting for your review.`
                : "Review complete. Rejected and unknown fields are not trusted values."}
            </p>
          )}
          {current.status === "ready" && current.errorCode === "partial" && (
            <p>
              Review each proposed detail against the original document before
              confirming it. Some details may be missing; enter them manually if
              needed.
            </p>
          )}
          {current.status === "ready" && current.fields.length <= 1 && (
            <p>
              Choose the correct supported document type above and start a new
              attempt, or enter details manually.
            </p>
          )}
          <p className="field-hint">
            {current.sourceKind === "user_transcript"
              ? "Based on text you supplied; compare it with the original document."
              : current.sourceKind === "manual"
                ? "Details entered manually. Check them against your original document."
                : "Based on text from your PDF. Check each detail against the original document."}
          </p>
        </section>
      )}
      {current?.fields.map((field) => (
        <FieldCard
          key={`${field.id}-${field.version}`}
          field={field}
          type={current.documentType}
          busy={busy}
          save={(action, value) =>
            request("PATCH", {
              fieldId: field.id,
              version: field.version,
              action,
              ...(action === "correct" ? { value } : {}),
            })
          }
        />
      ))}
    </div>
  );
}
function attemptDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(new Date(date));
}
function attemptLabel(attempt: Bundle["attempts"][number]) {
  const labels: Record<string, string> = {
    failed: "Failed",
    ready: "Ready for review",
    processing: "Extracting",
  };
  return `${labels[attempt.status] ?? "Needs review"} · ${attemptDate(attempt.createdAt)} WAT`;
}
function FieldCard({
  field,
  type,
  busy,
  save,
}: {
  field: ReviewField;
  type: string | null;
  busy: boolean;
  save: (action: string, value?: string) => Promise<void>;
}) {
  const [value, setValue] = useState(field.value ?? field.proposedValue ?? "");
  const label = labelFor(type, field.key);
  const inputId = `field-${field.id}`;
  return (
    <section
      className="card employment-form extraction-field"
      aria-label={label}
    >
      <h2>{label}</h2>
      <p className="badge">{field.reviewState.replaceAll("_", " ")}</p>
      <p>
        Confidence: {field.confidence.replaceAll("_", " ")}
        {["low", "needs_review"].includes(field.confidence) &&
          " · Needs clarification"}
      </p>
      <dl className="employment-details">
        <dt>Original proposal</dt>
        <dd>{field.proposedValue ?? "Not found in supplied content"}</dd>
        {field.evidence && (
          <>
            <dt>Source excerpt</dt>
            <dd>
              <blockquote>{field.evidence}</blockquote>
            </dd>
          </>
        )}
        {field.reviewState !== "proposed" && (
          <>
            <dt>Your reviewed value</dt>
            <dd>{field.value ?? "No trusted value"}</dd>
          </>
        )}
      </dl>
      <fieldset disabled={busy}>
        <label htmlFor={inputId}>
          {field.key === "document_type"
            ? "Correct category"
            : "Corrected value"}
        </label>
        {field.key === "document_type" ? (
          <select
            id={inputId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          >
            {[...supportedTypes, "other" as const].map((item) => (
              <option key={item} value={item}>
                {documentTypes[item]}
              </option>
            ))}
          </select>
        ) : (
          <textarea
            id={inputId}
            maxLength={1000}
            rows={3}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <div className="review-actions">
          <Button
            disabled={busy || !field.proposedValue}
            onClick={() => save("confirm")}
          >
            Confirm proposal
          </Button>
          <Button
            disabled={busy || !value.trim()}
            onClick={() => save("correct", value.trim())}
          >
            Save correction
          </Button>
          <Button className="secondary" onClick={() => save("reject")}>
            Reject
          </Button>
          <Button className="secondary" onClick={() => save("unknown")}>
            Mark unknown
          </Button>
        </div>
      </fieldset>
      {field.key === "document_type" && (
        <p className="field-hint">
          Changing this proposal does not rewrite the file category or its
          fields. Start a new attempt with the correct type to extract different
          fields.
        </p>
      )}
      {field.revisions.length > 0 && (
        <details>
          <summary>Review history</summary>
          <ol>
            {field.revisions.map((revision) => (
              <li key={revision.id}>
                {revision.state} · {revision.value ?? "No trusted value"} ·{" "}
                {new Date(revision.createdAt).toLocaleString()}
              </li>
            ))}
          </ol>
          <p className="field-hint">Showing the 20 most recent changes.</p>
        </details>
      )}
    </section>
  );
}
