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
  const name = displayName(profile);
  const needsReview = documents.filter(
    (doc) =>
      !doc.extractions[0] ||
      doc.extractions[0].status !== "ready" ||
      doc.extractions[0].fields.length > 0,
  ).length;
  const onboarding = (
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
          Explore Treviqo
        </a>
      </div>
    </section>
  );
  return (
    <>
      <p className="eyebrow">Your Treviqo</p>
      <h1>
        {records.length ? "Welcome back" : "Welcome to Treviqo"}
        {name ? `, ${name}` : ""}
      </h1>
      <p className="intro">Here’s what’s happening across your working life.</p>
      {!records.length && onboarding}

      {records.length ? (
        <>
          <Suspense fallback={<PageSkeleton label="Loading your overview…" />}>
            <HomeSummary
              userId={user.id}
              records={records}
              needsReview={needsReview}
              proposals={
                documents.filter(
                  (doc) =>
                    doc.extractions[0]?.status === "ready" &&
                    doc.extractions[0].fields.length > 0,
                ).length
              }
            />
          </Suspense>
          <EmploymentOverview records={Promise.resolve(records)} />
          {!documents.length && onboarding}
        </>
      ) : null}
      {(!records.length || !documents.length) && (
        <section id="explore" aria-labelledby="explore-title">
          <h2 id="explore-title">Explore your personal space</h2>
          <div className="explore-links">
            <Link className="touch-link" href="/documents">
              Keep your evidence in Documents
            </Link>
            <Link className="touch-link" href="/exit">
              Explore the Job Exit Checker
            </Link>
            <Link className="touch-link" href="/passport">
              See what your Benefit Passport keeps
            </Link>
          </div>
        </section>
      )}
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
            <h2 id="current-employment">Current employment</h2>
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
async function HomeSummary({
  userId,
  records,
  needsReview,
  proposals,
}: {
  userId: string;
  records: Awaited<ReturnType<typeof listEmployments>>;
  needsReview: number;
  proposals: number;
}) {
  const { current, previous } = groupEmployments(records);
  const service = exitService();
  const [exits, reminders] = await Promise.all([
    service.list(userId),
    reminderService().list(userId),
  ]);
  const activeExits = exits.filter((exit) =>
    current.some((record) => record.id === exit.employmentId),
  );
  const details = await Promise.all(
    activeExits.map((exit) => service.detail(userId, exit.id)),
  );
  const unresolvedExits = details.filter((exit) =>
    exit.checklist.some(
      (item) => item.state !== "complete" && item.state !== "not_applicable",
    ),
  );
  const hasAttention =
    proposals > 0 || reminders.length > 0 || unresolvedExits.length > 0;
  return (
    <>
      <section
        className="card home-attention"
        aria-labelledby="attention-title"
      >
        <h2 id="attention-title">What needs your attention</h2>
        {hasAttention ? (
          <ul className="attention-links">
            {proposals > 0 && (
              <li>
                <Link className="touch-link" href="/documents">
                  Review proposals in {proposals} document
                  {proposals === 1 ? "" : "s"}
                </Link>
              </li>
            )}
            {reminders.length > 0 && (
              <li>
                <Link className="touch-link" href="/reminders">
                  View {reminders.length} due reminder
                  {reminders.length === 1 ? "" : "s"}
                </Link>
              </li>
            )}
            {unresolvedExits.map((exit) => (
              <li key={exit.id}>
                <Link className="touch-link" href={`/exit/${exit.id}`}>
                  Review exit checklist for {exit.employerName} —{" "}
                  {exit.roleTitle}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>No outstanding actions identified in your current records.</p>
        )}
      </section>
      <section aria-label="Working-life overview">
        <h2 id="overview-title">Overview</h2>
        <div className="home-overview">
          <article className="card">
            <strong>{current.length}</strong>
            <h3>Current employments</h3>
            <a className="touch-link" href="#current-employment">
              View current employment
            </a>
          </article>
          <article className="card">
            <strong>{needsReview}</strong>
            <h3>Documents to review</h3>
            <Link className="touch-link" href="/documents">
              Open your documents
            </Link>
          </article>
          <article className="card">
            <strong>{activeExits.length}</strong>
            <h3>Active exit checklists</h3>
            <Link className="touch-link" href="/exit">
              Open Job Exit Checker
            </Link>
          </article>
          <article className="card">
            <strong>{previous.length}</strong>
            <h3>Closed employments</h3>
            <Link className="touch-link" href="/passport">
              Open Benefit Passport
            </Link>
          </article>
        </div>
      </section>
      {!reminders.length && (
        <p className="home-next-actions">
          <Link className="touch-link" href="/reminders">
            View reminders
          </Link>
        </p>
      )}
    </>
  );
}
