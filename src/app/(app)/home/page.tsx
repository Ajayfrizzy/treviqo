import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "@/components/action-link";
import { employmentPageUser } from "@/modules/employments/page-user";
import { listEmployments } from "@/modules/employments/service";
import { groupEmployments } from "@/modules/employments/validation";
import { exitService } from "@/modules/exits/service";
import { EmploymentCard } from "@/components/employment-card";
import { getDb } from "@/server/db/client";
import { getProfile } from "@/modules/profile/service";
import { displayName } from "@/modules/profile/shared";
import { reminderService } from "@/modules/reminders/service";
export default async function Home() {
  const user = await employmentPageUser();
  // Read only owned profile and document-review metadata; stream the heavier summaries.
  const [records, profile, documents] = await Promise.all([
    listEmployments(user.id),
    getProfile(user.id),
    getDb().employmentDocument.findMany({
      where: { userId: user.id, status: "ready" },
      select: {
        extractions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            status: true,
            fields: {
              where: { reviewState: "proposed" },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    }),
  ]);
  const exits = exitService().list(user.id);
  const name = displayName(profile);
  const { current, previous } = groupEmployments(records);
  const needsReview = documents.filter(
    (doc) =>
      !doc.extractions[0] ||
      doc.extractions[0].status !== "ready" ||
      doc.extractions[0].fields.length > 0,
  ).length;
  return (
    <>
      <p className="eyebrow">Your Treviqo</p>
      <h1>
        {records.length ? "Welcome back" : "Welcome to Treviqo"}
        {name ? `, ${name}` : ""}
      </h1>
      <p className="intro">Here’s what’s happening across your working life.</p>
      {(!records.length || !documents.length) && (
        <section
          className="card onboarding-card"
          aria-labelledby="onboarding-title"
        >
          <span className="badge">Your first steps</span>
          <h2 id="onboarding-title">
            {records.length
              ? "Give your record its first evidence."
              : "Your working life now has one place to stay."}
          </h2>
          <p>
            {records.length
              ? "Save a contract, payslip or another important document against your employment."
              : "Start with your employer, role and start date. You can explore first and come back whenever you’re ready."}
          </p>
          <ol className="onboarding-progress">
            <li>
              <span aria-hidden="true">✓</span>Create account — complete
            </li>
            <li>
              <span aria-hidden="true">{records.length ? "✓" : "2"}</span>Add
              employment{records.length ? " — complete" : ""}
            </li>
            <li>
              <span aria-hidden="true">3</span>Add first document
            </li>
          </ol>
          <div className="public-actions">
            <Link
              className="button-link"
              href={records.length ? "/documents/upload" : "/employments/new"}
            >
              {records.length
                ? "Add your first document"
                : "Add your first employment"}
            </Link>
            <a className="touch-link" href="#explore">
              Explore Treviqo first
            </a>
          </div>
        </section>
      )}
      {!!records.length && (
        <section className="home-overview" aria-label="Working-life overview">
          <article className="card">
            <strong>{current.length}</strong>
            <h2>Current employments</h2>
            <p>Active and exiting roles in your record.</p>
          </article>
          <article className="card">
            <strong>{needsReview}</strong>
            <h2>Documents to review</h2>
            <Link className="touch-link" href="/documents">
              Review your documents
            </Link>
          </article>
          <article className="card">
            <strong>{previous.length}</strong>
            <h2>Closed employments</h2>
            <Link className="touch-link" href="/passport">
              Open Benefit Passport
            </Link>
          </article>
          <Suspense fallback={<PageSkeleton label="Loading reminders…" />}>
            <ReminderOverview userId={user.id} />
          </Suspense>
        </section>
      )}
      <EmploymentOverview records={Promise.resolve(records)} />
      <section id="explore" aria-labelledby="explore-title">
        <h2 id="explore-title">Explore your personal space</h2>
        <div className="explore-links">
          <Link className="touch-link" href="/documents">
            Keep your evidence in Documents
          </Link>
          <Link className="touch-link" href="/passport">
            See what your Benefit Passport keeps
          </Link>
        </div>
      </section>
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
      {!records.length ? null : (
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

async function ReminderOverview({ userId }: { userId: string }) {
  const reminders = await reminderService().list(userId);
  return (
    <article className="card">
      <strong>{reminders.length}</strong>
      <h2>Reminders due</h2>
      <Link className="touch-link" href="/reminders">
        Check your next actions
      </Link>
    </article>
  );
}
