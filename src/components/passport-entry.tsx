"use client";
import { Button } from "./button";
import { uiRequest } from "./ui-request";
import Link from "@/components/action-link";
import { useState } from "react";
import {
  benefitCategories,
  portabilityLabels,
  type PassportDetail,
  type BenefitView,
  type Portability,
} from "@/modules/passport/shared";
import { exitTypes } from "@/modules/exits/shared";
import { formatEmploymentDate } from "@/modules/employments/validation";
const pensionStates: Record<string, string> = {
  not_started: "Not started",
  waiting: "Waiting for statement",
  contribution_detected: "Contribution detected — awaiting your confirmation",
  contribution_not_detected: "Contribution not detected in reviewed entries",
  needs_clarification: "Needs clarification — review current evidence",
  confirmed: "Confirmed by you — not provider verification",
};
export function PassportEntry({ initial }: { initial: PassportDetail }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<BenefitView | null>(null);
  const [operation, setOperation] = useState("");
  async function request(command?: unknown) {
    if (busy) return false;
    setOperation(
      command
        ? "Saving your assessment and checking evidence…"
        : "Refreshing your Passport…",
    );
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await uiRequest(`/api/passport/${data.id}`, {
        cache: "no-store",
        method: command ? "POST" : "GET",
        headers: command ? { "content-type": "application/json" } : undefined,
        body: command ? JSON.stringify(command) : undefined,
      });
      const result = await response.json();
      if (response.status === 404) setUnavailable(true);
      if (!response.ok) throw new Error(result.error || "Please retry.");
      setData(result);
      setEditing(null);
      setSuccess(
        command
          ? "Benefit assessment saved. Current evidence has been checked."
          : "Passport refreshed from current records.",
      );
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please retry.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (unavailable)
    return (
      <section className="card">
        <h1>Passport entry no longer available</h1>
        <p>
          Only closed employment appears here. Return to your current employment
          records.
        </p>
        <Link className="button-link" href="/">
          Manage employment
        </Link>
      </section>
    );
  return (
    <div className="passport-flow">
      <Link className="touch-link" href="/passport">
        ← Passport timeline
      </Link>
      <header>
        <p className="eyebrow">Your personal history</p>
        <h1>{data.employer}</h1>
        <p className="intro">{data.role}</p>
        <p>
          Current source records, not a legal record or employer verification.
          Sensitive identifiers are omitted or masked.
        </p>
        <Button className="secondary" disabled={busy} onClick={() => request()}>
          Refresh Passport
        </Button>
      </header>
      {busy && <p role="status">{operation}</p>}
      {error && (
        <p role="alert" className="form-message">
          {error} Displayed records are from the last successful load; refresh
          before relying on them.
        </p>
      )}
      {success && (
        <p role="status" className="form-message">
          {success}
        </p>
      )}
      <section className="card" aria-label="Employment summary">
        <h2>Employment period</h2>
        <span className="badge">Worker-entered</span>
        <p>
          {formatEmploymentDate(data.startDate)} –{" "}
          {data.endDate
            ? formatEmploymentDate(data.endDate)
            : "End date unknown"}
        </p>
        <p>
          Closed is the status you recorded, not proof that all exit actions are
          complete.
        </p>
        {data.dateWarning && <p className="form-message">{data.dateWarning}</p>}
        <Link className="touch-link" href={`/employments/${data.id}/edit`}>
          Correct employment details
        </Link>
      </section>
      <section className="card" aria-label="Exit summary">
        <h2>Exit status</h2>
        {data.exit ? (
          <>
            <p>
              {exitTypes[data.exit.type as keyof typeof exitTypes]} ·
              worker-entered
            </p>
            <p>
              Last working date:{" "}
              {formatEmploymentDate(data.exit.lastWorkingDate)}
            </p>
            <p>
              {data.exit.unresolved
                ? `${data.exit.unresolved} of ${data.exit.total} checklist items need attention.`
                : "No outstanding checklist items in current answers. This is not a legal or readiness verdict."}
            </p>
            <Link className="touch-link" href={`/exit/${data.exit.id}`}>
              Review exit checklist
            </Link>
          </>
        ) : (
          <>
            <p>Unknown — no exit case recorded.</p>
            <Link
              className="touch-link"
              href={`/exit/new?employmentId=${data.id}`}
            >
              Add exit details
            </Link>
          </>
        )}
      </section>
      <section className="card" aria-label="Pension summary">
        <h2>Pension history</h2>
        <p>
          Participation:{" "}
          {data.pension.participation === "yes"
            ? "Yes — worker-entered"
            : data.pension.participation === "no"
              ? "No — worker-entered"
              : "Unknown"}
        </p>
        <h3>Provider</h3>
        <p>{data.pension.provider ?? "Unknown / needs clarification"}</p>
        <p className="quiet">{data.pension.providerBasis}</p>
        {data.pension.providerDocuments.map((id, index) => (
          <Link
            key={id}
            className="touch-link"
            href={`/documents/${id}/review`}
          >
            Review provider source {index + 1}
          </Link>
        ))}
        <h3>Final contribution check</h3>
        <p>{pensionStates[data.pension.state] ?? "Unknown"}</p>
        {data.pension.targetPeriod && (
          <p>Target contribution month: {data.pension.targetPeriod}</p>
        )}
        <p>
          A benefit portability assessment does not confirm contributions or
          current coverage.
        </p>
        {data.exit && (
          <Link className="touch-link" href={`/exit/${data.exit.id}/finance`}>
            Review pension verification
          </Link>
        )}
      </section>
      <section aria-label="Benefit history">
        <h2>Benefits from this employment</h2>
        <p>
          Reviewed wording and worker assessments are labelled separately.
          Portability is never assumed from a benefit category.
        </p>
        <div className="passport-flow">
          {data.benefits.map((benefit) => (
            <article
              className="card"
              aria-label={benefitCategories[benefit.category]}
              key={benefit.category}
            >
              <h3>{benefitCategories[benefit.category]}</h3>
              <span className="badge">
                {portabilityLabels[benefit.classification]}
              </span>
              {benefit.stale && (
                <p className="form-message">
                  Previous assessment:{" "}
                  {portabilityLabels[benefit.savedClassification]} — no longer
                  current.
                </p>
              )}
              <p>{benefit.message}</p>
              <p className="quiet">{benefit.basis}</p>
              {benefit.updatedAt && (
                <p className="quiet">
                  Last assessed:{" "}
                  {formatEmploymentDate(benefit.updatedAt.slice(0, 10))}
                </p>
              )}
              {benefit.mentions.map((mention, index) => (
                <Link
                  className="touch-link"
                  key={`${mention.documentId}-${index}`}
                  href={`/documents/${mention.documentId}/review`}
                >
                  {mention.label} · source {index + 1}
                </Link>
              ))}
              {benefit.documentId &&
                data.sources.some(
                  (source) => source.id === benefit.documentId,
                ) && (
                  <Link
                    className="touch-link"
                    href={`/documents/${benefit.documentId}`}
                  >
                    Open assessment evidence
                  </Link>
                )}
              {editing?.category === benefit.category ? (
                <BenefitForm
                  key={`${benefit.category}-${benefit.version}`}
                  benefit={benefit}
                  data={data}
                  busy={busy}
                  save={(input) => request({ action: "save", input })}
                  cancel={() => setEditing(null)}
                />
              ) : (
                <Button disabled={busy} onClick={() => setEditing(benefit)}>
                  {benefit.version === null
                    ? "Assess benefit"
                    : "Review assessment"}
                </Button>
              )}
              {benefit.version !== null && (
                <Button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove your assessment? Original employment and evidence remain.",
                      )
                    )
                      return request({
                        action: "remove",
                        category: benefit.category,
                        version: benefit.version,
                      });
                  }}
                >
                  Remove assessment
                </Button>
              )}
            </article>
          ))}
        </div>
      </section>
      <section aria-label="Key document status">
        <h2>Key document status</h2>
        <p>
          Available means a private record is saved, not that its contents or
          coverage are verified.
        </p>
        <div className="passport-flow">
          {data.documents.map((group) => (
            <article className="card" key={group.category}>
              <h3>{group.label}</h3>
              <p>{group.state}</p>
              {group.records.map((record) => (
                <div key={record.id}>
                  <Link className="touch-link" href={`/documents/${record.id}`}>
                    {record.label}
                  </Link>
                  <p className="quiet">{record.review}</p>
                </div>
              ))}
            </article>
          ))}
        </div>
        <Link className="touch-link" href="/documents">
          Manage evidence in Documents
        </Link>
      </section>
    </div>
  );
}
function BenefitForm({
  benefit,
  data,
  busy,
  save,
  cancel,
}: {
  benefit: BenefitView;
  data: PassportDetail;
  busy: boolean;
  save: (input: unknown) => Promise<boolean>;
  cancel: () => void;
}) {
  const [classification, setClassification] = useState<Portability>(
    benefit.classification,
  );
  const [docId, setDoc] = useState(benefit.documentId ?? "");
  const [fieldId, setField] = useState(benefit.fieldId ?? "");
  const [acknowledged, setAcknowledged] = useState(false);
  const prefix = benefit.category;
  const source = data.sources.find((source) => source.id === docId);
  const field = source?.fields.find((field) => field.id === fieldId);
  return (
    <form
      className="employment-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save({
          category: benefit.category,
          classification,
          version: benefit.version,
          contextToken: data.contextToken,
          documentId: docId || null,
          fieldId: fieldId || null,
          fieldVersion: field?.version ?? null,
          evidenceAcknowledged: acknowledged,
        });
      }}
    >
      <fieldset disabled={busy}>
        <label htmlFor={`${prefix}-classification`}>
          Your portability assessment
        </label>
        <select
          id={`${prefix}-classification`}
          value={classification}
          onChange={(event) => {
            setClassification(event.target.value as Portability);
            setAcknowledged(false);
          }}
        >
          {Object.entries(portabilityLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor={`${prefix}-document`}>Supporting document</label>
        <select
          id={`${prefix}-document`}
          required={classification !== "unknown"}
          value={docId}
          onChange={(event) => {
            setDoc(event.target.value);
            setField("");
            setAcknowledged(false);
          }}
        >
          <option value="">No evidence selected</option>
          {docId && !source && (
            <option value={docId}>
              Previous evidence unavailable — choose again
            </option>
          )}
          {data.sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </select>
        <label htmlFor={`${prefix}-field`}>Reviewed field (optional)</label>
        <select
          id={`${prefix}-field`}
          value={fieldId}
          onChange={(event) => {
            setField(event.target.value);
            setAcknowledged(false);
          }}
        >
          <option value="">I reviewed the original document</option>
          {fieldId && !field && (
            <option value={fieldId}>
              Previous field unavailable — choose again
            </option>
          )}
          {source?.fields
            .filter((field) => field.category === benefit.category)
            .map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
        </select>
        {docId && source && (
          <Link className="touch-link" href={`/documents/${docId}`}>
            Check original evidence
          </Link>
        )}
        <p className="field-hint">
          Portable means you assessed that it can continue independently of this
          employer. Employer-linked means it depends on this employment. If
          unclear, leave Unknown and confirm with the provider/employer.
        </p>
        <label className="passport-checkbox">
          <input
            type="checkbox"
            required={classification !== "unknown"}
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          I checked the evidence and it supports this assessment.
        </label>
        <div className="form-actions paired-actions">
          <Button type="submit" aria-busy={busy}>
            {busy ? "Saving…" : "Save assessment"}
          </Button>
          <Button type="button" className="button-cancel" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
