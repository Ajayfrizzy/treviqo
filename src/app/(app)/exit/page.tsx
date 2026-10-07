import Link from "next/link";
import { employmentPageUser } from "@/modules/employments/page-user";
import { exitService } from "@/modules/exits/service";
import { exitTypes } from "@/modules/exits/shared";
import { formatEmploymentDate } from "@/modules/employments/validation";
export default async function ExitPage() {
  const user = await employmentPageUser();
  const cases = await exitService().list(user.id);
  return (
    <>
      <p className="eyebrow">Your next chapter</p>
      <h1>Job Exit Checker</h1>
      <p className="intro">
        Keep track of the dates, records, and questions to clarify as you leave
        a job.
      </p>
      <Link className="button-link" href="/exit/new">
        Start an exit checklist
      </Link>
      {!cases.length ? (
        <section className="card history">
          <h2>No exit cases yet</h2>
          <p>
            Start an exit checklist above. Choose your employment and last
            working date to see the records and questions to follow up. You can
            save and return at any step.
          </p>
        </section>
      ) : (
        <div className="employment-list history">
          {cases.map((item) => (
            <article key={item.id} className="card employment-card exit-job">
              <h2>{item.employment.employerName}</h2>
              <p>
                {item.employment.roleTitle} · {exitTypes[item.exitType]}
              </p>
              <p>
                Last working date: {formatEmploymentDate(item.lastWorkingDate)}
              </p>
              <Link className="touch-link" href={`/exit/${item.id}`}>
                Open checklist
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
