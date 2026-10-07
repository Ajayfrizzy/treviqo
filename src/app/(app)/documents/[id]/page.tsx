import Link from "next/link";
import { notFound } from "next/navigation";
import { documentPageUser } from "@/modules/documents/page-user";
import { documentService } from "@/modules/documents/service";
import { DocumentError } from "@/modules/documents/validation";
import {
  documentTypes,
  documentStatusLabels,
  fileSizeLabel,
} from "@/modules/documents/shared";
import { DocumentActions } from "@/components/document-actions";
export default async function DocumentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ uploaded?: string }>;
}) {
  const user = await documentPageUser();
  let doc;
  try {
    doc = await documentService().detail(user.id, (await params).id);
  } catch (error) {
    if (error instanceof DocumentError && error.status === 404) notFound();
    throw error;
  }
  const query = await searchParams;
  return (
    <>
      <Link className="touch-link" href="/documents">
        ← Documents
      </Link>
      {query.uploaded === "1" && doc.status === "ready" && (
        <p role="status" className="form-message">
          Document uploaded.
        </p>
      )}
      <p className="eyebrow">Your document</p>
      <h1>{doc.sanitizedFilename}</h1>
      <section className="card">
        <span className="badge">{documentStatusLabels[doc.status]}</span>
        <dl className="employment-details">
          <dt>Original filename</dt>
          <dd>{doc.originalFilename}</dd>
          <dt>Category</dt>
          <dd>{documentTypes[doc.documentType]}</dd>
          <dt>Employment</dt>
          <dd>
            <Link href={`/employments/${doc.employmentId}`}>
              {doc.employment.employerName} · {doc.employment.roleTitle}
            </Link>
          </dd>
          <dt>Uploaded</dt>
          <dd>
            {new Date(doc.createdAt).toLocaleString("en-NG", {
              timeZone: "Africa/Lagos",
            })}
          </dd>
          <dt>File</dt>
          <dd>
            {doc.mimeType} · {fileSizeLabel(doc.fileSize)}
          </dd>
        </dl>
        {doc.status === "ready" && (
          <p>
            <Link className="button-link" href={`/documents/${doc.id}/review`}>
              Extract and review details
            </Link>
          </p>
        )}
        {doc.status !== "ready" && (
          <p className="form-message">
            {doc.status === "deleting"
              ? "Deletion has not finished. Retry Delete document below to finish removing the file."
              : doc.status === "failed"
                ? "This upload did not finish. Remove this record, then upload the original file again."
                : "This file is not ready to open. Refresh its status below. If the upload has stopped, wait 15 minutes before removing this record and uploading again."}
          </p>
        )}
        <DocumentActions id={doc.id} ready={doc.status === "ready"} />
      </section>
    </>
  );
}
