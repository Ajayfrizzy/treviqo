"use client";
import { Button } from "./button";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/action-link";
import { documentTypes } from "@/modules/documents/shared";
type Employment = { id: string; employerName: string; roleTitle: string };
export function DocumentUpload({
  employments,
  maxMiB,
}: {
  employments: Employment[];
  maxMiB: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const file = fields.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("Choose a non-empty file.");
      return;
    }
    if (file.size > maxMiB * 1048576) {
      setError(`File exceeds the ${maxMiB} MiB limit.`);
      return;
    }
    setBusy(true);
    setProgress(0);
    setError("");
    const query = new URLSearchParams({
      employmentId: String(fields.get("employmentId")),
      documentType: String(fields.get("documentType")),
    });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/documents?${query}`);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.timeout = 90000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        setProgress(Math.round((event.loaded / event.total) * 100));
    };
    const failed = (message: string) => {
      setBusy(false);
      setError(message);
    };
    xhr.onerror = xhr.ontimeout = () =>
      failed(
        "Upload could not complete. Check Documents before retrying to avoid duplicates.",
      );
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status !== 201) {
          failed(result.error || "Upload failed. Please try again.");
          return;
        }
        router.push(`/documents/${result.document.id}?uploaded=1`);
        router.refresh();
      } catch {
        failed("Upload could not complete. Check Documents before retrying.");
      }
    };
    xhr.send(file);
  }
  return (
    <form className="employment-form" onSubmit={upload} aria-busy={busy}>
      {error && (
        <p role="alert" className="form-message">
          {error} <Link href="/documents">Check Documents</Link>
        </p>
      )}
      <fieldset disabled={busy}>
        <legend className="sr-only">Upload document</legend>
        <label htmlFor="employmentId">Employment</label>
        <select
          id="employmentId"
          name="employmentId"
          required
          defaultValue={employments.length === 1 ? employments[0]?.id : ""}
        >
          <option value="" disabled>
            Choose an employment
          </option>
          {employments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.employerName} — {item.roleTitle}
            </option>
          ))}
        </select>
        <label htmlFor="documentType">Document category</label>
        <select name="documentType" id="documentType" defaultValue="other">
          {Object.entries(documentTypes).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="field-hint">
          Not sure? Keep Other. You do not need to guess.
        </p>
        <label htmlFor="file">Choose a file</label>
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          required
          aria-describedby="file-hint"
        />
        <p id="file-hint" className="field-hint">
          PDF, JPEG, or PNG · Up to {maxMiB} MiB. Your original file remains
          your evidence.
        </p>
      </fieldset>
      {busy && (
        <div role="status">
          <label htmlFor="upload-progress">
            {progress < 100
              ? `Uploading… ${progress}%`
              : "Upload transferred. Saving your private document…"}
          </label>
          <progress
            id="upload-progress"
            max={100}
            value={progress < 100 ? progress : undefined}
          />
        </div>
      )}
      <div className="form-actions paired-actions">
        <Button disabled={busy} aria-busy={busy} type="submit">
          {busy ? "Uploading…" : "Upload document"}
        </Button>
        {busy ? (
          <Button type="button" className="button-cancel" disabled>
            Cancel
          </Button>
        ) : (
          <Link className="button-link button-cancel" href="/documents">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
