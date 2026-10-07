import Link from "next/link";
import { notFound } from "next/navigation";
import { documentPageUser } from "@/modules/documents/page-user";
import { documentService } from "@/modules/documents/service";
import { extractionService } from "@/modules/extractions/service";
import { DocumentError } from "@/modules/documents/validation";
import { ExtractionReview } from "@/components/extraction-review";
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await documentPageUser();
  const { id } = await params;
  let doc;
  let initial;
  try {
    doc = await documentService().detail(user.id, id);
    initial = await extractionService().read(user.id, id);
  } catch (error) {
    if (error instanceof DocumentError && error.status === 404) notFound();
    throw error;
  }
  return (
    <>
      <Link className="touch-link" href={`/documents/${id}`}>
        ← Source document
      </Link>
      <p className="eyebrow">Document intelligence</p>
      <h1>Review document details</h1>
      <p className="intro">{doc.sanitizedFilename}</p>
      <ExtractionReview documentId={id} initial={initial} />
    </>
  );
}
