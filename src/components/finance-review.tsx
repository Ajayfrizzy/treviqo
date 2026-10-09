"use client";
import { Button } from "./button";
import { uiRequest } from "./ui-request";
import Link from "@/components/action-link";
import { useState } from "react";
import {
  categories,
  expectedKeys,
  type FinanceView,
  type SettlementView,
  type ReviewedField,
  type Category,
} from "@/modules/finance/shared";
const labels: Record<string, string> = {
  consistent: "Amounts consistent",
  not_identified: "Not identified",
  needs_clarification: "Needs clarification",
  waiting: "Waiting for statement",
  contribution_detected: "Contribution detected — confirm",
  contribution_not_detected: "Contribution not detected",
  confirmed: "Confirmed by you",
};
export function FinanceReview({ initial }: { initial: FinanceView }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState<SettlementView | null>(null);
  const [formKey, setFormKey] = useState(0);
  async function request(body?: unknown): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await uiRequest(
        `/api/exits/${data.exitCaseId}/finance`,
        {
          method: body ? "POST" : "GET",
          headers: body ? { "content-type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Please retry.");
      setData(result);
      setSuccess(
        body
          ? "Review saved. Results reflect current evidence."
          : "Review refreshed.",
      );
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please retry.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="finance-flow" aria-busy={busy}>
      <section className="card">
        <h2>Use reviewed evidence</h2>
        <p>
          Upload a final settlement or pension statement in Documents, extract
          or enter its fields manually, then confirm or correct them.
          Comparisons use only reviewed values from this employment.
        </p>
        <Link className="button-link" href="/documents/upload">
          Upload evidence
        </Link>
        <Link className="touch-link" href="/documents">
          Open document reviews
        </Link>
        <Button
          pendingLabel="Refreshing…"
          className="secondary"
          disabled={busy}
          onClick={() => request()}
        >
          Refresh evidence
        </Button>
      </section>
      {error && (
        <p role="alert" className="form-message">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="form-message">
          {success}
        </p>
      )}
      <section>
        <h2>Final settlement comparisons</h2>
        <p>
          Identify the period and category for each comparison. A match does not
          prove payment or entitlement; no proration, currency conversion or
          total calculation is performed.
        </p>
        {!data.items.length && (
          <p>
            No comparison items yet. Start with a reviewed amount from your
            employment evidence.
          </p>
        )}
        <div className="finance-flow">
          {data.items.map((item) => (
            <article className="card" key={item.id} aria-label={item.label}>
              <span className="badge">{labels[item.result.state]}</span>
              <h3>{item.label}</h3>
              <p>
                {categories[item.category]} · {item.expectedPeriod} /{" "}
                {item.actualPeriod}
              </p>
              <p>
                Evidence amount: {item.expectedValue ?? "Unavailable / changed"}
                <br />
                Settlement amount:{" "}
                {item.actualValue ?? "Not selected / changed"}
              </p>
              <p>{item.result.message}</p>
              <p>
                <strong>Next action:</strong> {item.result.nextAction}
              </p>
              <Source
                field={data.fields.find(
                  (field) => field.id === item.expectedFieldId,
                )}
              />
              <Source
                field={data.fields.find(
                  (field) => field.id === item.actualFieldId,
                )}
              />
              <div className="form-actions">
                <Button
                  disabled={busy}
                  onClick={() => {
                    setEditing(item);
                    setFormKey((value) => value + 1);
                  }}
                >
                  Edit item
                </Button>
                <Button
                  pendingLabel="Removing…"
                  className="danger-button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove this comparison item? Source documents will remain.",
                      )
                    )
                      return request({
                        action: "settlement_remove",
                        id: item.id,
                        version: item.version,
                      });
                  }}
                >
                  Remove item
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <SettlementForm
        key={formKey}
        data={data}
        initial={editing}
        busy={busy}
        cancel={() => {
          setEditing(null);
          setFormKey((value) => value + 1);
        }}
        save={async (item) => {
          if (await request({ action: "settlement_save", item })) {
            setEditing(null);
            setFormKey((value) => value + 1);
          }
        }}
      />
      <section className="card">
        <h2>Pension exit verification</h2>
        {!data.pensionApplicable && (
          <p>
            Record pension participation as Yes in{" "}
            <Link href={`/exit/${data.exitCaseId}/edit`}>exit answers</Link>{" "}
            before starting or confirming this check.
          </p>
        )}
        {!data.pension ? (
          <>
            <p>
              No verification started. Closing a pension-enabled employment with
              an exit case creates a waiting check; you can also start one now.
            </p>
            <Button
              pendingLabel="Starting check…"
              disabled={busy || !data.pensionApplicable}
              onClick={() => request({ action: "pension_start" })}
            >
              Start pension check
            </Button>
          </>
        ) : (
          <>
            <span className="badge">{labels[data.pension.result.state]}</span>
            <p>{data.pension.result.message}</p>
            <p>
              <strong>Next action:</strong> {data.pension.result.nextAction}
            </p>
            {data.pension.followUpDate && (
              <p>
                Follow up on: {data.pension.followUpDate}. This date is used for
                in-app follow-up reminders while verification is unresolved.
              </p>
            )}
            <PensionForm
              key={`${data.pension.id}-${data.pension.version}`}
              data={data}
              busy={busy}
              save={(input) => request({ action: "pension_save", input })}
            />
            {data.pension.statementRunId &&
              data.runs.find(
                (run) => run.id === data.pension!.statementRunId,
              ) && (
                <Link
                  className="touch-link"
                  href={`/documents/${data.runs.find((run) => run.id === data.pension!.statementRunId)!.documentId}/review`}
                >
                  Review source statement fields
                </Link>
              )}
            {data.pension.result.state === "contribution_detected" && (
              <Button
                pendingLabel="Confirming…"
                disabled={busy}
                onClick={() =>
                  request({
                    action: "pension_confirm",
                    version: data.pension!.version,
                    evidenceToken: data.pension!.evidenceToken,
                  })
                }
              >
                I checked the statement — confirm match
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
function Source({ field }: { field?: ReviewedField }) {
  return field ? (
    <Link className="touch-link" href={`/documents/${field.documentId}/review`}>
      {field.documentName}: {field.key.replaceAll("_", " ")}
    </Link>
  ) : null;
}
function SettlementForm({
  data,
  initial,
  busy,
  save,
  cancel,
}: {
  data: FinanceView;
  initial: SettlementView | null;
  busy: boolean;
  save: (item: unknown) => Promise<void>;
  cancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [category, setCategory] = useState<Category>(
    initial?.category ?? "final_salary",
  );
  const [doc, setDoc] = useState(initial?.documentId ?? "");
  const [expectedId, setExpected] = useState(initial?.expectedFieldId ?? "");
  const [actualId, setActual] = useState(initial?.actualFieldId ?? "");
  const [expectedPeriod, setExpectedPeriod] = useState(
    initial?.expectedPeriod ?? data.defaultPeriod,
  );
  const [actualPeriod, setActualPeriod] = useState(
    initial?.actualPeriod ?? data.defaultPeriod,
  );
  const [submitting, setSubmitting] = useState(false);
  const expected = data.fields.find((field) => field.id === expectedId);
  const actual = data.fields.find((field) => field.id === actualId);
  return (
    <form
      className="card employment-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || submitting) return;
        setSubmitting(true);
        try {
          await save({
            ...(initial ? { id: initial.id, version: initial.version } : {}),
            label,
            category,
            documentId: doc,
            expectedFieldId: expectedId,
            expectedFieldVersion: expected?.version ?? -1,
            actualFieldId: actualId || null,
            actualFieldVersion: actual?.version ?? null,
            expectedPeriod,
            actualPeriod,
          });
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <h2>{initial ? "Edit comparison" : "Add comparison item"}</h2>
      <fieldset disabled={busy}>
        <label htmlFor="item-label">Item label</label>
        <input
          id="item-label"
          required
          maxLength={160}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <label htmlFor="item-category">Comparison category</label>
        <select
          id="item-category"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value as Category);
            setExpected("");
            setActual("");
          }}
        >
          {Object.entries(categories).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor="settlement-document">Final-settlement document</label>
        <select
          id="settlement-document"
          required
          value={doc}
          onChange={(event) => {
            setDoc(event.target.value);
            setActual("");
          }}
        >
          <option value="">Choose a current settlement</option>
          {doc && !data.documents.some((item) => item.id === doc) && (
            <option value={doc}>Previous document unavailable</option>
          )}
          {data.documents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <label htmlFor="expected-field">
          Reviewed amount to compare against
        </label>
        <select
          id="expected-field"
          required
          value={expectedId}
          onChange={(event) => setExpected(event.target.value)}
        >
          <option value="">Choose employment evidence</option>
          {expectedId && !expected && (
            <option value={expectedId}>Previous field unavailable</option>
          )}
          {data.fields
            .filter(
              (field) =>
                field.documentId !== doc &&
                expectedKeys[category].includes(field.key),
            )
            .map((field) => (
              <option key={field.id} value={field.id}>
                {field.documentName} · {field.key.replaceAll("_", " ")} ·{" "}
                {field.value}
              </option>
            ))}
        </select>
        <label htmlFor="actual-field">Reviewed settlement amount</label>
        <select
          id="actual-field"
          value={actualId}
          onChange={(event) => setActual(event.target.value)}
        >
          <option value="">
            I did not identify this item in the full document
          </option>
          {actualId && !actual && (
            <option value={actualId}>Previous field unavailable</option>
          )}
          {data.fields
            .filter(
              (field) =>
                field.documentId === doc &&
                field.type === "final_settlement" &&
                field.key === category,
            )
            .map((field) => (
              <option key={field.id} value={field.id}>
                {field.key.replaceAll("_", " ")} · {field.value}
              </option>
            ))}
        </select>
        <label htmlFor="expected-period">
          Evidence contribution / pay period (YYYY-MM)
        </label>
        <input
          id="expected-period"
          type="month"
          required
          value={expectedPeriod}
          onChange={(event) => setExpectedPeriod(event.target.value)}
        />
        <label htmlFor="actual-period">Settlement period (YYYY-MM)</label>
        <input
          id="actual-period"
          type="month"
          required
          value={actualPeriod}
          onChange={(event) => setActualPeriod(event.target.value)}
        />
        <p className="field-hint">
          By saving, you identify these periods and confirm that the chosen
          fields describe the same item. Do not compare gross salary with net
          pay, recurring salary with partial pay, or an unapproved claim with an
          approved amount.
        </p>
        <div
          className={initial ? "form-actions paired-actions" : "form-actions"}
        >
          <Button type="submit" aria-busy={submitting}>
            {submitting ? "Saving…" : "Save comparison"}
          </Button>
          {initial && (
            <Button type="button" className="button-cancel" onClick={cancel}>
              Cancel editing
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
function PensionForm({
  data,
  busy,
  save,
}: {
  data: FinanceView;
  busy: boolean;
  save: (input: unknown) => Promise<boolean>;
}) {
  const current = data.pension!;
  const [period, setPeriod] = useState(current.targetPeriod);
  const [runId, setRun] = useState(current.statementRunId ?? "");
  const [expectedId, setExpected] = useState(current.expectedFieldId ?? "");
  const [followUp, setFollowUp] = useState(current.followUpDate ?? "");
  const [submitting, setSubmitting] = useState(false);
  const expected = data.fields.find((field) => field.id === expectedId);
  return (
    <form
      className="employment-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || submitting) return;
        setSubmitting(true);
        try {
          await save({
            version: current.version,
            targetPeriod: period,
            statementRunId: runId || null,
            expectedFieldId: expectedId || null,
            expectedFieldVersion: expected?.version ?? null,
            followUpDate: followUp || null,
          });
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <fieldset disabled={busy || !data.pensionApplicable}>
        <label htmlFor="target-period">
          Target contribution period (YYYY-MM)
        </label>
        <input
          id="target-period"
          type="month"
          required
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        />
        <p className="field-hint">
          Employer match uses {data.employerName}. Contribution period is not
          the posting date; late postings can still match.
        </p>
        <label htmlFor="statement-run">
          Reviewed pension statement attempt
        </label>
        <select
          id="statement-run"
          value={runId}
          onChange={(event) => setRun(event.target.value)}
        >
          <option value="">Waiting for a statement</option>
          {runId && !data.runs.some((run) => run.id === runId) && (
            <option value={runId}>Previous statement unavailable</option>
          )}
          {data.runs.map((run, index) => (
            <option key={run.id} value={run.id}>
              {run.name} · attempt {index + 1}
            </option>
          ))}
        </select>
        <p className="field-hint">
          In document review, enter coverage and contribution periods as
          YYYY-MM, posting dates as YYYY-MM-DD, and amounts with explicit
          currency (for example NGN 20000.00). Review employee and employer
          amounts separately. Correct the completeness field to “yes” only after
          checking that every statement entry is represented; more than three
          entries need a narrower statement.
        </p>
        <label htmlFor="pension-expected">
          Reviewed employee deduction (optional)
        </label>
        <select
          id="pension-expected"
          value={expectedId}
          onChange={(event) => setExpected(event.target.value)}
        >
          <option value="">Match employer and period only</option>
          {expectedId && !expected && (
            <option value={expectedId}>Previous deduction unavailable</option>
          )}
          {data.fields
            .filter(
              (field) =>
                field.type === "payslip" && field.key === "pension_deduction",
            )
            .map((field) => (
              <option key={field.id} value={field.id}>
                {field.documentName} · {field.value}
              </option>
            ))}
        </select>
        <label htmlFor="follow-up-date">Follow-up date (optional)</label>
        <input
          id="follow-up-date"
          type="date"
          value={followUp}
          onChange={(event) => setFollowUp(event.target.value)}
        />
        <Button type="submit" aria-busy={submitting}>
          {submitting ? "Saving…" : "Save pension review"}
        </Button>
      </fieldset>
    </form>
  );
}
