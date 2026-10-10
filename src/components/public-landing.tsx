import Link from "@/components/action-link";
import { HeroPreview, JourneyPreview } from "@/components/public-previews";
const areas = [
  [
    "01",
    "Employment history",
    "Your roles, dates and employers, kept in one continuous record.",
  ],
  [
    "02",
    "Secure documents",
    "Save contracts, payslips and other evidence with private access.",
  ],
  [
    "03",
    "AI-assisted document review",
    "Get proposed details from your documents. Confirm or correct every important field.",
  ],
  [
    "04",
    "Job Exit Checker",
    "Turn your dates, evidence and answers into a practical exit checklist.",
  ],
  [
    "05",
    "Settlement and pension review",
    "Compare reviewed amounts and track pension items that need follow-up.",
  ],
  [
    "06",
    "Benefit Passport",
    "Keep your closed employment history and benefit assessments together.",
  ],
  [
    "07",
    "Reminders",
    "See outstanding actions and in-app prompts for your next step.",
  ],
];
export function PublicLanding() {
  return (
    <div className="public-site">
      <header className="public-header">
        <Link href="/" className="public-brand" aria-label="Treviqo home">
          treviqo<span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Public">
          <a className="touch-link" href="#how-it-works">
            How it works
          </a>
          <Link className="button-link secondary" href="/sign-in">
            Sign in
          </Link>
          <Link className="button-link" href="/register">
            Create account
          </Link>
        </nav>
      </header>
      <main id="main">
        <section className="landing-hero public-section">
          <div className="hero-copy">
            <p className="eyebrow">For the person behind the job</p>
            <h1>
              Your working life.
              <br />
              <span>Yours to keep.</span>
            </h1>
            <p className="hero-intro">
              Jobs change. Your story stays with you.
            </p>
            <p>
              Keep your employment records, documents, job-exit details, pension
              follow-ups and benefit history together in a worker-owned space.
            </p>
            <div className="public-actions">
              <Link className="button-link" href="/register">
                Create your account <span aria-hidden="true">↗</span>
              </Link>
              <Link className="touch-link" href="/sign-in">
                Sign in <span aria-hidden="true">→</span>
              </Link>
            </div>
            <p className="hero-note">
              Built around your working life. From your first record to your
              next chapter.
            </p>
          </div>
          <HeroPreview />
        </section>
        <section
          className="public-section problem-section reveal"
          aria-labelledby="problem-title"
        >
          <div>
            <p className="eyebrow">Less scattered. More together.</p>
            <h2 id="problem-title">
              Your records shouldn’t
              <br />
              leave when you do.
            </h2>
            <p>
              A contract in your inbox. Payslips with an old employer. A pension
              statement somewhere else. Treviqo gives those pieces a place to
              belong.
            </p>
          </div>
          <div className="record-map">
            <ul>
              {[
                "Employers",
                "Email",
                "Payslips",
                "Contracts",
                "Pension records",
                "Exit documents",
              ].map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <span className="map-connector" aria-hidden="true">
              ↓
            </span>
            <div className="map-destination">
              <strong>One personal record</strong>
              <span>Organised around you.</span>
            </div>
          </div>
        </section>
        <section
          className="public-section reveal"
          aria-labelledby="areas-title"
        >
          <div className="section-intro">
            <p className="eyebrow">Built for your working life</p>
            <h2 id="areas-title">
              The important details.
              <br />A clearer next step.
            </h2>
            <p>
              Practical tools for keeping evidence, reviewing details and
              carrying your history forward.
            </p>
          </div>
          <div className="feature-grid">
            {areas.map(([number, title, description], index) => (
              <article
                className="feature-card"
                key={number}
                style={{ "--reveal-order": index } as React.CSSProperties}
              >
                <span className="feature-number">{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section
          id="how-it-works"
          className="public-section journey-section reveal"
          aria-labelledby="journey-title"
        >
          <p className="eyebrow">Start small. Build continuity.</p>
          <h2 id="journey-title">One record at a time.</h2>
          <JourneyPreview />
        </section>
        <section
          className="public-section trust-grid reveal"
          aria-label="Trust and ownership"
        >
          <article>
            <span className="eyebrow">AI assists. You decide.</span>
            <h2>
              A proposal, until
              <br />
              you confirm it.
            </h2>
            <p>
              AI proposes details from your documents. You check, correct and
              confirm them before they become trusted information. Manual entry
              is always available.
            </p>
            <p>
              Deterministic rules use your answers and reviewed evidence for
              checklist logic. Treviqo does not determine legal entitlement or
              provide independent verification.
            </p>
          </article>
          <article>
            <span className="eyebrow">Your records belong with you</span>
            <h2>
              Private by design.
              <br />
              Worker-owned.
            </h2>
            <p>
              Treviqo is your personal space, independent of your employer.
              Documents use private storage and account ownership checks, with
              time-limited download access.
            </p>
            <p>
              Keep your original evidence, review your account details and
              control your records as your working life changes.
            </p>
          </article>
        </section>
        <section className="public-section final-cta reveal">
          <p className="eyebrow">Your next chapter starts here</p>
          <h2>
            Make room for
            <br />
            your working life.
          </h2>
          <p>Start with one employment. Build a record that stays with you.</p>
          <div className="public-actions">
            <Link className="button-link" href="/register">
              Create your account <span aria-hidden="true">↗</span>
            </Link>
            <Link className="touch-link" href="/sign-in">
              Already have an account? Sign in
            </Link>
          </div>
        </section>
      </main>
      <footer className="public-footer">
        <span className="public-brand">
          treviqo<span className="brand-dot">.</span>
        </span>
        <p>Employment. Benefits. Continuity.</p>
        <span>Made for workers.</span>
      </footer>
    </div>
  );
}
