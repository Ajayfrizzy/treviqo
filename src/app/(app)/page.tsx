import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "@/components/action-link";
import { employmentPageUser } from "@/modules/employments/page-user";
import { listEmployments } from "@/modules/employments/service";
import { groupEmployments } from "@/modules/employments/validation";
import { exitService } from "@/modules/exits/service";
import { EmploymentCard } from "@/components/employment-card";
export default async function Home() {
  const user = await employmentPageUser();
  // Start independent reads together; each section can stream when ready.
  const records = listEmployments(user.id);
  const exits = exitService().list(user.id);
  return (
    <>
      <p className="eyebrow">Your Treviqo</p>
      <h1>Your working life.</h1>
      <p className="intro">
        Your roles and your history, together in a space that belongs to you.
      </p>
      <Suspense fallback={<PageSkeleton label="Loading employments…" />}>
        <EmploymentOverview records={records} />
      </Suspense>
      <p className="history">
        <Link className="button-link secondary" href="/reminders">
          View reminders
        </Link>
      </p>
      <Suspense fallback={<PageSkeleton label="Loading exit checklists…" />}>
        <ExitOverview exits={exits} />
      </Suspense>
    </>
  );
}

async function EmploymentOverview({
  records: pending,
}: {
  records: ReturnType<typeof listEmployments>;
}) {
  const records = await pending;
  const { current, previous } = groupEmployments(records);
  return (
    <>
      {!records.length ? (
        <section className="card empty-employment">
          <span className="badge">Start here</span>
          <h2>Make room for your working life</h2>
          <p>
            Start with your employer, role, and start date. This connects your
            documents, exit checklist, and future Benefit Passport.
          </p>
          <Link className="button-link" href="/employments/new">
            Add your first employment
          </Link>
        </section>
      ) : (
        <>
          <div className="section-heading">
            <h2>Current employment</h2>
            <Link className="touch-link" href="/employments/new">
              Add employment
            </Link>
          </div>
          {current.length ? (
            <div className="employment-list">
              {current.map((record) => (
                <EmploymentCard key={record.id} employment={record} />
              ))}
            </div>
          ) : (
            <section className="card">
              <p>
                No current employment recorded. Your previous roles are kept
                below.
              </p>
            </section>
          )}
          <section aria-labelledby="previous-heading" className="history">
            <h2 id="previous-heading">Previous employment</h2>
            {previous.length ? (
              <div className="employment-list">
                {previous.map((record) => (
                  <EmploymentCard key={record.id} employment={record} />
                ))}
              </div>
            ) : (
              <p>No previous employment recorded yet.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
async function ExitOverview({
  exits: pending,
}: {
  exits: ReturnType<ReturnType<typeof exitService>["list"]>;
}) {
  const exits = await pending;
  return (
    <section className="card exit-context">
      <h2>
        {exits.length ? "Your exit checklists" : "No active exit process"}
      </h2>
      <p>
        {exits.length
          ? `${exits.length} saved checklist${exits.length === 1 ? "" : "s"} to review.`
          : "Start a checklist when you have a planned or actual last working date."}
      </p>
      <Link className="touch-link" href="/exit">
        {exits.length ? "Review exit checklists" : "Open Job Exit Checker"}
      </Link>
    </section>
  );
}
