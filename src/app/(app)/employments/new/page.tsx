import Link from "next/link";
import { EmploymentForm } from "@/components/employment-form";
import { employmentPageUser } from "@/modules/employments/page-user";
export default async function NewEmployment() {
  await employmentPageUser();
  return (
    <>
      <Link className="touch-link" href="/">
        ← Home
      </Link>
      <p className="eyebrow">Build your record</p>
      <h1>Add employment</h1>
      <p className="intro">
        Start with the essentials. Add your current role or a previous job.
      </p>
      <section className="card">
        <EmploymentForm />
      </section>
    </>
  );
}
