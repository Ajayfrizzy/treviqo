"use client";
import { uiRequest } from "./ui-request";
import { useState } from "react";
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
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [text, setText] = useState("");
  const [type, setType] = useState("");
  const [operation, setOperation] = useState("");
  const current = data.extraction;
  async function request(
    method: "GET" | "POST" | "PATCH",
    body?: unknown,
    runId?: string,
  ) {
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
      if (method === "PATCH") setMessage("Review saved.");
      if (method === "POST" && result.extraction?.status === "ready")
        setMessage(
          "Details are ready for your review. Nothing is confirmed automatically.",
        );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please retry.");
    } finally {
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
      {busy && (
        <p role="status" className="form-message">
          {operation}
        </p>
      )}
      {!current && (
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
            <button
              onClick={() =>
                void request("POST", {
                  mode: "ai",
                  ...(type ? { type } : {}),
                  ...(text ? { text } : {}),
                })
              }
            >
              Extract details
            </button>
            <button
              className="secondary"
              onClick={() => {
                if (!type) {
                  setError("Choose a document type for manual entry.");
                  return;
                }
                void request("POST", { mode: "manual", type });
              }}
            >
              Enter details manually
            </button>
          </div>
        </fieldset>
      </section>
      {data.attempts.length > 0 && (
        <section className="employment-form">
          <label htmlFor="attempt">Review attempt</label>
          <select
            id="attempt"
            disabled={busy}
            value={current?.id ?? ""}
            onChange={(event) =>
              void request("GET", undefined, event.target.value)
            }
          >
            {data.attempts.map((attempt, index) => (
              <option key={attempt.id} value={attempt.id}>
                {index === 0 ? "Latest" : `Earlier ${index}`} · {attempt.status}{" "}
                · {new Date(attempt.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void request("GET", undefined, current?.id)}
          >
            Refresh review
          </button>
        </section>
      )}
      {current && (
        <section className="card">
          <h2>Review status</h2>
          {current.status === "failed" ? (
            <p role="alert">
              {failureMessages[current.errorCode ?? ""] ??
                failureMessages.interrupted}
            </p>
          ) : current.status === "processing" ? (
            <p role="status">
              Extraction in progress. Refresh shortly. If it was interrupted,
              you can start a new attempt after two minutes.
            </p>
          ) : (
            <p>
              {remaining
                ? `${remaining} fields waiting for your review.`
                : "Review complete. Rejected and unknown fields are not trusted values."}
            </p>
          )}
          {current.status === "ready" && current.fields.length <= 1 && (
            <p>
              Choose the correct supported document type above and start a new
              attempt, or enter details manually.
            </p>
          )}
          <details>
            <summary>Source and extraction record</summary>
            <p>
              Source:{" "}
              {current.sourceKind === "user_transcript"
                ? "Your transcription (not verified against the file)"
                : current.sourceKind === "manual"
                  ? "Manual entry"
                  : "PDF text"}
              . Model: {current.model}. Prompt: {current.promptVersion}. Schema:{" "}
              {current.schemaVersion}.
            </p>
            <p>
              AI confidence is a model estimate, not a verified probability.
            </p>
          </details>
        </section>
      )}
      {current?.fields.map((field) => (
        <FieldCard
          key={`${field.id}-${field.version}`}
          field={field}
          type={current.documentType}
          busy={busy}
          save={(action, value) =>
            void request("PATCH", {
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
function FieldCard({
  field,
  type,
  busy,
  save,
}: {
  field: ReviewField;
  type: string | null;
  busy: boolean;
  save: (action: string, value?: string) => void;
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
          <button
            disabled={busy || !field.proposedValue}
            onClick={() => save("confirm")}
          >
            Confirm proposal
          </button>
          <button
            disabled={busy || !value.trim()}
            onClick={() => save("correct", value.trim())}
          >
            Save correction
          </button>
          <button className="secondary" onClick={() => save("reject")}>
            Reject
          </button>
          <button className="secondary" onClick={() => save("unknown")}>
            Mark unknown
          </button>
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
