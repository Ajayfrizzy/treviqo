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
  const [pending, setPending] = useState<
    "starting" | "saving" | "refreshing" | null
  >(null);
  const busy = pending !== null;
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
  const [interactionId, setInteractionId] = useState<string | null>(
    initial.extraction?.status === "processing" ? initial.extraction.id : null,
  );
  const [selected, setSelected] = useState<ExtractionRecord | null>(null);
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState("");
  const historySequence = useRef(0);
  const historyCache = useRef(
    new Map<string, ExtractionRecord>(
      initial.extraction && initial.extraction.status !== "processing"
        ? [[initial.extraction.id, initial.extraction]]
        : [],
    ),
  );
  const historical = selected !== null;
  const latestResult = data.extraction;
  const latestVisible =
    latestResult &&
    (latestResult.status !== "failed" || latestResult.id === interactionId);
  const current = historyLoading
    ? null
    : (selected ?? (newAttempt ? null : latestVisible ? latestResult : null));
  const active =
    !historical &&
    !!current &&
    (current.id === interactionId || current.status === "processing");
  const previous = data.attempts;
  function closeHistory() {
    historySequence.current++;
    setSelected(null);
    setHistoryLoading(null);
    setHistoryError("");
    setError("");
    setMessage("");
  }
  function cache(record: ExtractionRecord | null) {
    if (!record) return;
    // Processing snapshots can change without a review; always reread them.
    if (record.status === "processing") historyCache.current.delete(record.id);
    else historyCache.current.set(record.id, record);
    while (historyCache.current.size > 20)
      historyCache.current.delete(historyCache.current.keys().next().value!);
  }
  async function loadHistory(runId: string) {
    const sequence = ++historySequence.current;
    setSelected(null);
    setHistoryError("");
    setError("");
    setMessage("");
    const cached = historyCache.current.get(runId);
    if (cached) {
      setSelected(cached);
      setHistoryLoading(null);
      return;
    }
    setHistoryLoading(runId);
    try {
      const response = await uiRequest(
        `/api/documents/${documentId}/extractions?runId=${encodeURIComponent(runId)}`,
        { method: "GET" },
        120000,
      );
      const result: Bundle & { error?: string } = await response.json();
      if (!response.ok || !result.extraction)
        throw new Error(
          result.error || "Previous attempt could not be loaded. Try again.",
        );
      if (sequence !== historySequence.current) return;
      cache(result.extraction);
      setSelected(result.extraction);
    } catch (error) {
      if (sequence === historySequence.current)
        setHistoryError(
          error instanceof Error
            ? error.message
            : "Previous attempt could not be loaded. Try again.",
        );
    } finally {
      if (sequence === historySequence.current) setHistoryLoading(null);
    }
  }
  async function request(method: "GET" | "POST" | "PATCH", body?: unknown) {
    if (inFlight.current) return;
    inFlight.current = true;
    if (method === "POST") {
      setNewAttempt((body as { mode: "ai" | "manual" }).mode);
      setHistoryOpen(false);
      closeHistory();
    }
    if (method === "GET") closeHistory();
    setOperation(
      method === "GET"
        ? "Loading the latest review…"
        : method === "PATCH"
          ? "Saving your review…"
          : (body as { mode?: string })?.mode === "manual"
            ? "Preparing fields for manual entry…"
            : "Processing your document. Extraction can take up to 90 seconds. Keep this page open, or return later and refresh the review.",
    );
    setPending(
      method === "POST"
        ? "starting"
        : method === "PATCH"
          ? "saving"
          : "refreshing",
    );
    setError("");
    setMessage("");
    try {
      const response = await uiRequest(
        `/api/documents/${documentId}/extractions`,
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
      cache(result.extraction);
      if (method === "PATCH") {
        setData((previous) => ({
          ...previous,
          attempts: result.attempts,
          extraction:
            previous.extraction?.id === result.extraction?.id
              ? result.extraction
              : previous.extraction,
        }));
        setSelected((previous) =>
          previous?.id === result.extraction?.id ? result.extraction : previous,
        );
      } else {
        setData(result);
        // Refreshing an uncertain POST only promotes a genuinely new record.
        if (
          method === "POST" ||
          (newAttempt === "uncertain" &&
            result.extraction?.id !== data.extraction?.id)
        )
          setInteractionId(result.extraction?.id ?? null);
      }
      if (method !== "PATCH") setNewAttempt(null);
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
      setPending(null);
    }
  }
  const remaining =
    current?.fields.filter((field) => field.reviewState === "proposed")
      .length ?? 0;
  return (
    <div className="extraction-flow">
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
      {!current && !newAttempt && !historyLoading && (
        <section className="card">
          <h2>
            {data.attempts.length
              ? "Ready for a new attempt"
              : "No extracted details yet"}
          </h2>
          <p>
            Extract proposals from a text-based PDF, or choose a document type
            and enter the details yourself.
          </p>
        </section>
      )}
      <section
        className="card employment-form"
        aria-busy={pending === "starting"}
      >
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
      {newAttempt && !historical && !historyLoading && (
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
          {(historical || historyLoading || historyError) && (
            <Button
              className="secondary"
              disabled={busy}
              onClick={closeHistory}
            >
              Back to latest
            </Button>
          )}
          {!historical &&
            !historyLoading &&
            (latestVisible || newAttempt === "uncertain") && (
              <Button
                className="secondary"
                disabled={busy}
                onClick={() => request("GET")}
              >
                Refresh review
              </Button>
            )}
          {historyError && <p role="alert">{historyError}</p>}
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
                      onClick={() => loadHistory(attempt.id)}
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
      {historyLoading && (
        <section
          className="card"
          aria-label="Previous attempt"
          aria-busy="true"
        >
          <p role="status">Loading previous attempt…</p>
        </section>
      )}
      {current && (
        <section
          className="card"
          aria-label={
            historical
              ? "Previous attempt"
              : active
                ? "Current attempt"
                : "Latest result"
          }
          aria-busy={pending === "saving" || pending === "refreshing"}
        >
          {!active && (
            <p className="eyebrow">
              {historical ? "Previous attempt" : "Latest result"} ·{" "}
              {attemptDate(current.createdAt)} WAT
            </p>
          )}
          <h2>
            {current.status === "failed"
              ? "Extraction failed"
              : current.status === "processing"
                ? historical
                  ? "Recorded as processing"
                  : "Extracting details…"
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
              {historical
                ? "This saved attempt was processing when read. Back to latest shows the latest review context."
                : "This may take up to 90 seconds. Refresh shortly to see the result."}
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
  const savedValue = field.value ?? field.proposedValue ?? "";
  const [value, setValue] = useState(savedValue);
  const changed = value.trim() !== savedValue.trim();
  const reviewed =
    field.reviewState === "confirmed" || field.reviewState === "corrected";
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
            disabled={busy || !field.proposedValue || reviewed || changed}
            onClick={() => save("confirm")}
          >
            Confirm proposal
          </Button>
          <Button
            disabled={busy || !value.trim() || !changed}
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
