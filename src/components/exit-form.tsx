"use client";
import { uiRequest } from "./ui-request";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  emptyExitInput,
  exitSchema,
  exitTypes,
  type ExitEvidence,
  type ExitInput,
  type ExitRecord,
} from "@/modules/exits/shared";
const steps = [
  "Exit details",
  "Notice",
  "Money and pension",
  "Records and benefits",
];
const followupOptions = {
  unknown: "Not sure yet",
  none: "Nothing to follow up",
  pending: "Needs follow-up",
  resolved: "Clarified with my employer",
};
export function ExitForm({
  employmentId,
  employerName,
  evidence,
  initial,
}: {
  employmentId: string;
  employerName: string;
  evidence: ExitEvidence;
  initial?: ExitRecord;
}) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [answers, setAnswers] = useState<ExitInput>(
    initial?.answers ?? emptyExitInput,
  );
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  function set<K extends keyof ExitInput>(key: K, value: ExitInput[K]) {
    setAnswers((previous) => ({ ...previous, [key]: value }));
  }
  function validate() {
    const result = exitSchema.safeParse(answers);
    const fields: Record<string, string> = result.success
      ? {}
      : Object.fromEntries(
          result.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        );
    if (
      answers.lastWorkingDate &&
      answers.lastWorkingDate < evidence.employmentStart
    )
      fields.lastWorkingDate =
        "Last working date cannot be before the employment start date.";
    setErrors(fields);
    if (Object.keys(fields).length) {
      setError("Check the highlighted details.");
      setStep(
        fields.lastWorkingDate || fields.noticeDate || fields.exitType ? 0 : 1,
      );
      return false;
    }
    setError("");
    return true;
  }
  function move(next: number) {
    if (next > step && !validate()) return;
    setStep(next);
    setTimeout(() => heading.current?.focus(), 0);
  }
  async function save() {
    if (!validate()) return;
    setBusy(true);
    setError("");
    try {
      const response = await uiRequest(
        `/api/exits${initial ? `/${initial.id}` : ""}`,
        {
          method: initial ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            initial
              ? { version: initial.version, answers }
              : { employmentId, answers },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setErrors(result.fields ?? {});
        throw new Error(result.error || "Could not save. Please retry.");
      }
      router.push(`/exit/${result.exitCase.id}?saved=1`);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save. Please retry.",
      );
      setBusy(false);
    }
  }
  function select<K extends keyof ExitInput>(
    key: K,
    label: string,
    options: Record<string, string>,
  ) {
    return (
      <div>
        <label htmlFor={key}>{label}</label>
        <select
          id={key}
          value={String(answers[key] ?? "")}
          onChange={(event) => set(key, event.target.value as ExitInput[K])}
        >
          {Object.entries(options).map(([value, title]) => (
            <option key={value} value={value}>
              {title}
            </option>
          ))}
        </select>
      </div>
    );
  }
  function documentSelect(
    key:
      | "finalPayDocumentId"
      | "reimbursementDocumentId"
      | "assetDocumentId"
      | "exitDocumentId"
      | "referenceDocumentId",
    label: string,
  ) {
    const id = answers[key];
    const available = evidence.documents.some((doc) => doc.id === id);
    return (
      <div>
        <label htmlFor={key}>{label}</label>
        <select
          id={key}
          value={id ?? ""}
          onChange={(event) => set(key, event.target.value || null)}
        >
          <option value="">Not selected / not available yet</option>
          {id && !available && (
            <option value={id}>
              Previous selection is no longer available
            </option>
          )}
          {evidence.documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.name}
            </option>
          ))}
        </select>
      </div>
    );
  }
  const selectedNotice = answers.noticeFieldId
    ? `${answers.noticeFieldId}:${answers.noticeFieldVersion}`
    : "";
  return (
    <form
      className="employment-form card exit-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      noValidate
      aria-busy={busy}
    >
      <p className="eyebrow">
        {employerName} · Step {step + 1} of {steps.length}
      </p>
      <h2 ref={heading} tabIndex={-1}>
        {steps[step]}
      </h2>
      <p>
        Your checklist reflects your answers and selected records. You can save
        after entering the exit type and last working date, then return to
        complete the other steps.
      </p>
      {error && (
        <p role="alert" className="form-message">
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        {step === 0 && (
          <>
            {select("exitType", "How is this employment ending?", exitTypes)}
            <label htmlFor="lastWorkingDate">
              Planned or actual last working date
            </label>
            <input
              id="lastWorkingDate"
              type="date"
              required
              value={answers.lastWorkingDate}
              aria-invalid={Boolean(errors.lastWorkingDate)}
              aria-describedby={
                errors.lastWorkingDate ? "last-date-error" : undefined
              }
              onChange={(event) => set("lastWorkingDate", event.target.value)}
            />
            {errors.lastWorkingDate && (
              <p id="last-date-error" className="field-error">
                {errors.lastWorkingDate}
              </p>
            )}
            <p className="field-hint">
              Required for the checklist. Use the date communicated or agreed
              for this exit; you can correct it later. Creating a case does not
              close your employment record.
            </p>
            <label htmlFor="noticeDate">
              Notice / decision communicated on (optional)
            </label>
            <input
              id="noticeDate"
              type="date"
              value={answers.noticeDate ?? ""}
              onChange={(event) =>
                set("noticeDate", event.target.value || null)
              }
              aria-invalid={Boolean(errors.noticeDate)}
              aria-describedby={
                errors.noticeDate ? "notice-date-error" : undefined
              }
            />
            {errors.noticeDate && (
              <p id="notice-date-error" className="field-error">
                {errors.noticeDate}
              </p>
            )}
          </>
        )}
        {step === 1 && (
          <>
            {select(
              "noticeApplicable",
              "Does a notice-period comparison apply?",
              {
                unknown: "I need to clarify",
                yes: "Yes",
                no: "No, based on my arrangement",
              },
            )}
            <p className="field-hint">
              Exit type alone does not establish a notice requirement. Working
              days, pay-in-lieu and conditional clauses need clarification.
            </p>
            <label htmlFor="notice-source">
              Use a confirmed contract notice field (optional)
            </label>
            <select
              id="notice-source"
              value={selectedNotice}
              onChange={(event) => {
                const field = evidence.noticeFields.find(
                  (field) =>
                    `${field.id}:${field.version}` === event.target.value,
                );
                setAnswers((previous) => ({
                  ...previous,
                  noticeFieldId: field?.id ?? null,
                  noticeFieldVersion: field?.version ?? null,
                  noticeRequirement: null,
                }));
              }}
            >
              <option value="">Enter wording myself / not known yet</option>
              {selectedNotice &&
                !evidence.noticeFields.some(
                  (field) => `${field.id}:${field.version}` === selectedNotice,
                ) && (
                  <option value={selectedNotice}>
                    Previous field changed or is no longer available
                  </option>
                )}
              {evidence.noticeFields.map((field) => (
                <option key={field.id} value={`${field.id}:${field.version}`}>
                  {field.name}: {field.value}
                </option>
              ))}
            </select>
            {!answers.noticeFieldId && (
              <>
                <label htmlFor="noticeRequirement">
                  Notice wording (optional)
                </label>
                <textarea
                  id="noticeRequirement"
                  rows={3}
                  maxLength={1000}
                  value={answers.noticeRequirement ?? ""}
                  onChange={(event) =>
                    set("noticeRequirement", event.target.value || null)
                  }
                />
                <p className="field-hint">
                  Copy the original wording. Simple durations such as “30 days”,
                  “2 weeks” or “1 month” can be compared. Do not simplify a
                  conditional clause just to get a Complete result.
                </p>
              </>
            )}
            <p>
              Only explicitly confirmed/corrected fields are offered. Nothing is
              inferred from an unreviewed AI proposal.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            {documentSelect(
              "finalPayDocumentId",
              "Final payslip / settlement record (optional)",
            )}
            <label htmlFor="finalPayPeriod">
              Pay period shown on that record (optional)
            </label>
            <input
              id="finalPayPeriod"
              maxLength={160}
              value={answers.finalPayPeriod ?? ""}
              onChange={(event) =>
                set("finalPayPeriod", event.target.value || null)
              }
            />
            <p className="field-hint">
              Identify the period yourself. This checker does not verify pay,
              calculate entitlement, or compare settlement amounts.
            </p>
            {select("leave", "Unused leave follow-up", followupOptions)}
            {select(
              "reimbursements",
              "Reimbursement follow-up",
              followupOptions,
            )}
            {documentSelect(
              "reimbursementDocumentId",
              "Expense / approval evidence (optional)",
            )}
            {select(
              "pension",
              "Did you participate in a pension scheme through this job?",
              { unknown: "Not sure yet", yes: "Yes", no: "No" },
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={answers.pensionDetailsSaved}
                onChange={(event) =>
                  set("pensionDetailsSaved", event.target.checked)
                }
              />
              I have saved my pension provider/contact details privately
            </label>
            <p className="field-hint">
              This does not verify contributions. Do not enter account
              credentials or PINs.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            {select("assets", "Company asset return", {
              unknown: "Not sure what needs returning",
              none: "No assets to return",
              held: "I still hold assets",
              scheduled: "Return is scheduled",
              returned: "Returned",
            })}
            {documentSelect(
              "assetDocumentId",
              "Asset return acknowledgement (optional)",
            )}
            {documentSelect(
              "exitDocumentId",
              "Letter / evidence for this exit (optional)",
            )}
            {select("reference", "Reference / employment evidence", {
              unknown: "Not sure what I need",
              not_needed: "No additional evidence needed",
              not_requested: "Needed, not requested yet",
              requested: "Requested, waiting",
              saved: "Saved",
            })}
            {documentSelect(
              "referenceDocumentId",
              "Reference / employment confirmation (optional)",
            )}
            {select(
              "benefits",
              "Employer-linked benefit end dates and contacts",
              followupOptions,
            )}
            <p className="field-hint">
              Include employer HMO, group-life or other employer-linked benefits
              where relevant. This records clarification, not benefit
              portability or continued coverage.
            </p>
            <Link className="touch-link" href="/documents/upload">
              Add missing evidence in Documents
            </Link>
          </>
        )}
        <div className="form-actions">
          {step > 0 && (
            <button
              type="button"
              className="secondary"
              onClick={() => move(step - 1)}
            >
              Back
            </button>
          )}
          {step < steps.length - 1 && (
            <button type="button" onClick={() => move(step + 1)}>
              Next
            </button>
          )}
        </div>
        <button type="submit" aria-busy={busy}>
          {busy ? "Saving…" : "Save and view checklist"}
        </button>
        <Link
          className="touch-link"
          href={initial ? `/exit/${initial.id}` : "/exit"}
        >
          Cancel
        </Link>
      </fieldset>
      {busy && <p role="status">Saving your answers…</p>}
    </form>
  );
}
