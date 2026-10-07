import Link from "next/link";
import { notFound } from "next/navigation";
import { employmentPageUser } from "@/modules/employments/page-user";
import { getEmployment } from "@/modules/employments/service";
import {
  formatEmploymentDate,
  statusLabels,
  typeLabels,
} from "@/modules/employments/validation";
export default async function EmploymentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await employmentPageUser();
  const record = await getEmployment(user.id, (await params).id);
  if (!record) notFound();
  const { saved } = await searchParams;
  return (
    <>
      <Link className="touch-link" href="/">
        ← Home
      </Link>
      {(saved === "created" || saved === "updated") && (
        <p role="status" className="form-message">
          Employment {saved === "created" ? "added" : "updated"}.
        </p>
      )}
      <p className="eyebrow">Your employment</p>
      <h1>{record.roleTitle}</h1>
      <p className="intro employer-name">{record.employerName}</p>
      <section className="card">
        <span className="badge">{statusLabels[record.status]}</span>
        <h2>Employment details</h2>
        <dl className="employment-details">
          <dt>Employer</dt>
          <dd>{record.employerName}</dd>
          <dt>Role or title</dt>
          <dd>{record.roleTitle}</dd>
          <dt>Start date</dt>
          <dd>{formatEmploymentDate(record.startDate)}</dd>
          <dt>
            {record.status === "exiting" ? "Expected end date" : "End date"}
          </dt>
          <dd>
            {record.endDate
              ? formatEmploymentDate(record.endDate)
              : "Not recorded"}
          </dd>
          <dt>Employment type</dt>
          <dd>
            {record.employmentType
              ? typeLabels[record.employmentType]
              : "Not specified"}
          </dd>
        </dl>
        <Link className="button-link" href={`/employments/${record.id}/edit`}>
          Edit employment
        </Link>
      </section>
      {record.status === "closed" && (
        <Link className="button-link" href={`/passport/${record.id}`}>
          View Passport entry
        </Link>
      )}
      <p className="quiet">
        These are the details you recorded. An employment status does not start
        or complete an exit process.
      </p>
    </>
  );
}
