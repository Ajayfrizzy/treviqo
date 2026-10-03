import Link from "next/link";
import { documentPageUser } from "@/modules/documents/page-user";
import { listEmployments } from "@/modules/employments/service";
import { getEnv } from "@/server/config/env";
import { DocumentUpload } from "@/components/document-upload";
export default async function Upload() {
  const user = await documentPageUser(); const employments = await listEmployments(user.id);
  return <><Link className="touch-link" href="/documents">← Documents</Link><h1>Upload document</h1><p className="intro">Choose an employment and add your evidence.</p><section className="card">{employments.length ? <DocumentUpload employments={employments} maxMiB={getEnv().DOCUMENT_MAX_FILE_MB} /> : <><p>Add an employment record before uploading documents.</p><Link className="button-link" href="/employments/new">Add employment</Link></>}</section></>;
}
