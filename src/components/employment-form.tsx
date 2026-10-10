"use client";
import { Button } from "./button";
import { uiRequest } from "./ui-request";
import Link from "@/components/action-link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  employmentSchema,
  statusLabels,
  typeLabels,
  type EmploymentInput,
  type EmploymentRecord,
} from "@/modules/employments/validation";
export function EmploymentForm({
  employment,
}: {
  employment?: EmploymentRecord;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<EmploymentInput["status"]>(
    employment?.status ?? "active",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const summary = useRef<HTMLDivElement>(null);
  function showError(message: string, errors: Record<string, string> = {}) {
    setError(message);
    setFields(errors);
    requestAnimationFrame(() => summary.current?.focus());
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const input = {
      employerName: values.get("employerName"),
      roleTitle: values.get("roleTitle"),
      startDate: values.get("startDate"),
      employmentType: values.get("employmentType") || null,
      endDate: status === "active" ? null : values.get("endDate") || null,
      status,
    };
    const parsed = employmentSchema.safeParse(input);
    if (!parsed.success) {
      const messages: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !messages[key])
          messages[key] = issue.message;
      }
      showError("Check the highlighted fields.", messages);
      return;
    }
    setBusy(true);
    setError("");
    setFields({});
    try {
      const response = await uiRequest(
        employment ? `/api/employments/${employment.id}` : "/api/employments",
        {
          method: employment ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        showError(
          response.status === 401
            ? "Your session has ended. Sign in again before saving."
            : (result.error ?? "Could not save. Please try again."),
          result.fields ?? {},
        );
        setBusy(false);
        return;
      }
      router.push(
        `/employments/${result.employment.id}?saved=${employment ? "updated" : "created"}`,
      );
      router.refresh();
    } catch {
      showError(
        "Could not connect. Your details are still here. Please try saving again.",
      );
      setBusy(false);
    }
  }
  const fieldError = (name: string) =>
    fields[name] ? (
      <p className="field-error" id={`${name}-error`}>
        {fields[name]}
      </p>
    ) : null;
  const attributes = (name: string) => ({
    "aria-invalid": Boolean(fields[name]),
    "aria-describedby": fields[name] ? `${name}-error` : undefined,
  });
  return (
    <form className="employment-form" onSubmit={save} aria-busy={busy}>
      {error && (
        <div ref={summary} tabIndex={-1} role="alert" className="form-message">
          {error}{" "}
          {error.startsWith("Your session") && (
            <Link href="/sign-in">Sign in</Link>
          )}
        </div>
      )}
      <fieldset disabled={busy}>
        <legend className="sr-only">Employment details</legend>
        <label htmlFor="employerName">Employer name</label>
        <input
          id="employerName"
          name="employerName"
          required
          maxLength={160}
          autoComplete="organization"
          defaultValue={employment?.employerName}
          {...attributes("employerName")}
        />
        {fieldError("employerName")}
        <label htmlFor="roleTitle">Role or title</label>
        <input
          id="roleTitle"
          name="roleTitle"
          required
          maxLength={160}
          autoComplete="organization-title"
          defaultValue={employment?.roleTitle}
          {...attributes("roleTitle")}
        />
        {fieldError("roleTitle")}
        <label htmlFor="startDate">Start date</label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          min="0001-01-01"
          max="9999-12-31"
          required
          defaultValue={employment?.startDate}
          {...attributes("startDate")}
        />
        {fieldError("startDate")}
        <label htmlFor="employmentType">
          Employment type <span className="optional">(optional)</span>
        </label>
        <select
          id="employmentType"
          name="employmentType"
          defaultValue={employment?.employmentType ?? ""}
          {...attributes("employmentType")}
        >
          <option value="">Not sure / not specified</option>
          {Object.entries(typeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {fieldError("employmentType")}
        <label htmlFor="status">Employment status</label>
        <select
          id="status"
          name="status"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as EmploymentInput["status"])
          }
          aria-describedby="status-hint"
        >
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p id="status-hint" className="field-hint">
          Active: currently working here. Exiting: preparing to leave. Closed: a
          previous job. This updates your record only.
        </p>
        {status !== "active" && (
          <>
            <label htmlFor="endDate">
              {status === "exiting" ? "Expected end date" : "End date"}{" "}
              <span className="optional">(optional)</span>
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              defaultValue={employment?.endDate ?? ""}
              {...attributes("endDate")}
            />
            {fieldError("endDate")}
            <p className="field-hint">Leave blank if the date is not known.</p>
          </>
        )}
      </fieldset>
      <div className="form-actions paired-actions">
        <Button type="submit" aria-busy={busy} disabled={busy}>
          {busy ? "Saving…" : "Save employment"}
        </Button>
        {busy ? (
          <Button type="button" className="button-cancel" disabled>
            Cancel
          </Button>
        ) : (
          <Link
            className="button-link button-cancel"
            href={employment ? `/employments/${employment.id}` : "/home"}
          >
            Cancel
          </Link>
        )}
      </div>
      {busy && <p role="status">Saving your employment record…</p>}
    </form>
  );
}
