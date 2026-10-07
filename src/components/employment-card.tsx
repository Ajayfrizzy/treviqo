import Link from "next/link";
import {
  formatEmploymentDate,
  statusLabels,
  typeLabels,
  type EmploymentRecord,
} from "@/modules/employments/validation";
export function EmploymentCard({
  employment,
}: {
  employment: EmploymentRecord;
}) {
  return (
    <article className="card employment-card">
      <span className="badge">{statusLabels[employment.status]}</span>
      <h3>{employment.roleTitle}</h3>
      <p className="employer-name">{employment.employerName}</p>
      <p className="employment-meta">
        <time dateTime={employment.startDate}>
          {formatEmploymentDate(employment.startDate)}
        </time>{" "}
        –{" "}
        {employment.endDate ? (
          <time dateTime={employment.endDate}>
            {formatEmploymentDate(employment.endDate)}
          </time>
        ) : employment.status === "closed" ? (
          "End date not recorded"
        ) : (
          "Present"
        )}
      </p>
      <p className="employment-meta">
        {employment.employmentType
          ? typeLabels[employment.employmentType]
          : "Employment type not specified"}
      </p>
      <Link className="touch-link" href={`/employments/${employment.id}`}>
        View employment
        <span className="sr-only"> at {employment.employerName}</span>
        <span aria-hidden="true"> →</span>
      </Link>
    </article>
  );
}
