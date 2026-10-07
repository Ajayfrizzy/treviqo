import Link from "@/components/action-link";
import { notFound } from "next/navigation";
import { employmentPageUser } from "@/modules/employments/page-user";
import { exitService } from "@/modules/exits/service";
import { DocumentError } from "@/modules/documents/validation";
import { ExitForm } from "@/components/exit-form";
export default async function EditExit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await employmentPageUser();
  let record;
  try {
    record = await exitService().detail(user.id, (await params).id);
  } catch (error) {
    if (error instanceof DocumentError && error.status === 404) notFound();
    throw error;
  }
  const evidence = await exitService().evidence(user.id, record.employmentId);
  return (
    <>
      <Link className="touch-link" href={`/exit/${record.id}`}>
        ← Checklist
      </Link>
      <h1>Update exit details</h1>
      <ExitForm
        employmentId={record.employmentId}
        employerName={record.employerName}
        evidence={evidence}
        initial={record}
      />
    </>
  );
}
