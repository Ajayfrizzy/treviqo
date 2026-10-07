import Link from "@/components/action-link";
import { notFound } from "next/navigation";
import { EmploymentForm } from "@/components/employment-form";
import { employmentPageUser } from "@/modules/employments/page-user";
import { getEmployment } from "@/modules/employments/service";
export default async function EditEmployment({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await employmentPageUser();
  const record = await getEmployment(user.id, (await params).id);
  if (!record) notFound();
  return (
    <>
      <Link className="touch-link" href={`/employments/${record.id}`}>
        ← Employment details
      </Link>
      <h1>Edit employment</h1>
      <p className="intro">
        Keep your record up to date, including when a role ends.
      </p>
      <section className="card">
        <EmploymentForm employment={record} />
      </section>
    </>
  );
}
