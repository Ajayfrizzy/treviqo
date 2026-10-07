import { DocumentFilter } from "@/components/document-filter";
import Link from "@/components/action-link";
import { documentPageUser } from "@/modules/documents/page-user";
import { documentService } from "@/modules/documents/service";
import { DocumentError } from "@/modules/documents/validation";
import { listEmployments } from "@/modules/employments/service";
import {
  documentTypes,
  documentStatusLabels,
  fileSizeLabel,
} from "@/modules/documents/shared";
import { notFound } from "next/navigation";
export default async function Documents({
  searchParams,
}: {
  searchParams: Promise<{ employmentId?: string; deleted?: string }>;
}) {
  const user = await documentPageUser();
  const query = await searchParams;
  let employments;
  let documents;
  try {
    [employments, documents] = await Promise.all([
      listEmployments(user.id),
      documentService().list(user.id, query.employmentId || undefined),
    ]);
  } catch (error) {
    if (error instanceof DocumentError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <p className="eyebrow">Your evidence</p>
      <h1>Documents</h1>
      <p className="intro">
        Keep the records that matter to your working life.
      </p>
      {query.deleted === "1" && (
        <p className="form-message" role="status">
          Document deleted.
        </p>
      )}
      {employments.length ? (
        <>
          <Link className="button-link" href="/documents/upload">
            Upload document
          </Link>
          <DocumentFilter>
            <label htmlFor="employment-filter">Filter by employment</label>
            <select
              id="employment-filter"
              name="employmentId"
              defaultValue={query.employmentId ?? ""}
            >
              <option value="">All employments</option>
              {employments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.employerName} — {item.roleTitle}
                </option>
              ))}
            </select>
          </DocumentFilter>
          {documents.length ? (
            <div className="employment-list">
              {documents.map((doc) => (
                <article className="card document-card" key={doc.id}>
                  <span className="badge">
                    {documentStatusLabels[doc.status]}
                  </span>
                  <h2>
                    <Link className="touch-link" href={`/documents/${doc.id}`}>
                      {doc.sanitizedFilename}
                    </Link>
                  </h2>
                  <p>{documentTypes[doc.documentType]}</p>
                  <p>
                    {doc.employment.employerName} · {doc.employment.roleTitle}
                  </p>
                  <p className="employment-meta">
                    {new Date(doc.createdAt).toLocaleDateString("en-NG", {
                      timeZone: "Africa/Lagos",
                    })}{" "}
                    · {fileSizeLabel(doc.fileSize)} ·{" "}
                    {doc.mimeType === "application/pdf"
                      ? "PDF"
                      : doc.mimeType === "image/png"
                        ? "PNG"
                        : "JPEG"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <section className="card">
              <h2>No documents yet</h2>
              <p>
                {query.employmentId
                  ? "No documents for this employment. Upload your first file when you are ready."
                  : "Use Upload document above to add a contract or payslip. Your originals stay here as evidence for reviews and exit checks."}
              </p>
            </section>
          )}
        </>
      ) : (
        <section className="card">
          <h2>Add an employment first</h2>
          <p>
            Keep contracts, payslips, and exit evidence privately with the job
            they belong to. Add your employment, then upload your first file.
          </p>
          <Link className="button-link" href="/employments/new">
            Add employment
          </Link>
        </section>
      )}
    </>
  );
}
