"use client";

import { useRef, useState } from "react";

const features = [
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

const icons = [
  "M8 7V4h8v3M3 7h18v13H3ZM3 12h18M10 12v3h4v-3",
  "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5ZM12 14v3",
  "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z",
  "M9 5V2h6v3M5 5h14v17H5ZM8 12l2 2 5-5M9 18h6",
  "M4 20V10h4v10M10 20V4h4v16M16 20v-8h4v8",
  "M4 3h16v18H4ZM8 16h8M9 8h6M12 5v6",
  "M5 16V9a7 7 0 0 1 14 0v7l2 2H3ZM9 21h6",
];

// Illustrative records only: these panels never read or modify account data.
function FeaturePreview({ index }: { index: number }) {
  const headings = [
    "Your work timeline",
    "Your document vault",
    "Proposed details",
    "Your exit checklist",
    "Evidence to compare",
    "Your Benefit Passport",
    "Next steps",
  ];
  return (
    <div
      className={`feature-preview feature-preview-${index + 1}`}
      role="img"
      aria-label={`Illustrative example: ${headings[index]}`}
    >
      <span className="feature-preview-caption" aria-hidden="true">
        Example preview
      </span>
      <div className="feature-preview-sheet" aria-hidden="true">
        <div className="feature-preview-heading">
          <strong>{headings[index]}</strong>
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={icons[index]} />
          </svg>
        </div>
        {index === 0 && (
          <div className="feature-preview-timeline">
            <div className="feature-preview-entry">
              <strong>Acme Studio</strong>
              <span>Product designer</span>
              <small>2024 – Present</small>
            </div>
            <div className="feature-preview-entry">
              <strong>Bright Solutions</strong>
              <span>Design associate</span>
              <small>2021 – 2024</small>
            </div>
          </div>
        )}
        {index === 1 && (
          <div className="feature-preview-documents">
            {["Contract.pdf", "Payslip.pdf", "Exit letter.pdf"].map(
              (name, i) => (
                <div className="feature-preview-file" key={name}>
                  <span
                    className={`feature-preview-file-icon feature-tone-${i}`}
                  >
                    PDF
                  </span>
                  <strong>{name}</strong>
                </div>
              ),
            )}
            <span className="feature-preview-footnote">Private access</span>
          </div>
        )}
        {index === 2 && (
          <>
            <div className="feature-preview-row">
              <span>Employer</span>
              <strong>Acme Studio</strong>
            </div>
            <div className="feature-preview-row">
              <span>Start date</span>
              <strong>Jan 2024</strong>
            </div>
            <div className="feature-preview-note">From your contract</div>
            <span className="feature-preview-badge feature-preview-pending">
              Awaiting your review
            </span>
          </>
        )}
        {index === 3 && (
          <div className="feature-preview-checklist">
            {[
              "Record exit dates",
              "Collect exit letter",
              "Review pension records",
            ].map((label, i) => (
              <div className="feature-preview-check" key={label}>
                <span className={i === 0 ? "is-complete" : ""}>
                  {i === 0 ? "✓" : ""}
                </span>
                <span>
                  {label}
                  <small>{i === 0 ? "Complete" : "Needs confirmation"}</small>
                </span>
              </div>
            ))}
          </div>
        )}
        {index === 4 && (
          <>
            <div className="feature-preview-row">
              <span>Expected amount</span>
              <strong>₦120,000</strong>
            </div>
            <div className="feature-preview-row">
              <span>Document amount</span>
              <strong>₦120,000</strong>
            </div>
            <div className="feature-preview-note">
              Reimbursement · reviewed evidence
            </div>
            <span className="feature-preview-badge feature-preview-pending">
              Pension: follow-up needed
            </span>
          </>
        )}
        {index === 5 && (
          <>
            <div className="feature-preview-passport">
              <span className="feature-preview-monogram">AS</span>
              <div>
                <strong>Acme Studio</strong>
                <small>2021 – 2024 · Closed role</small>
              </div>
            </div>
            <div className="feature-preview-row">
              <span>Employment record</span>
              <strong>Saved</strong>
            </div>
            <div className="feature-preview-row">
              <span>Benefit assessment</span>
              <strong>Recorded</strong>
            </div>
            <span className="feature-preview-footnote">
              Your history, carried forward
            </span>
          </>
        )}
        {index === 6 && (
          <div className="feature-preview-reminders">
            <div className="feature-preview-reminder">
              <span className="feature-preview-date">
                12<small>OCT</small>
              </span>
              <div>
                <strong>Upload pension statement</strong>
                <small>Upcoming follow-up</small>
              </div>
            </div>
            <div className="feature-preview-reminder">
              <span className="feature-preview-date">
                18<small>OCT</small>
              </span>
              <div>
                <strong>Review exit letter</strong>
                <small>Waiting for confirmation</small>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function LandingFeatures() {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  function updatePosition() {
    const node = track.current;
    if (!node) return;
    const first = (node.children[0] as HTMLElement).offsetLeft;
    let nearest = 0;
    let distance = Infinity;
    Array.from(node.children).forEach((card, index) => {
      const next = Math.abs(
        (card as HTMLElement).offsetLeft - first - node.scrollLeft,
      );
      if (next < distance) {
        distance = next;
        nearest = index;
      }
    });
    setActive(nearest);
  }
  function move(index: number) {
    const node = track.current;
    if (!node) return;
    const card = node.children[index] as HTMLElement;
    node.scrollTo({
      left: card.offsetLeft - (node.children[0] as HTMLElement).offsetLeft,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <div className="landing-features">
      <p className="feature-swipe-hint">
        Swipe to explore all seven features <span aria-hidden="true">→</span>
      </p>
      <div
        className="feature-grid"
        ref={track}
        tabIndex={0}
        role="group"
        aria-label="Working-life features"
        onScroll={updatePosition}
        onKeyDown={(event) => {
          if (!window.matchMedia("(max-width: 599px)").matches) return;
          const next =
            event.key === "ArrowRight"
              ? Math.min(6, active + 1)
              : event.key === "ArrowLeft"
                ? Math.max(0, active - 1)
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 6
                    : null;
          if (next !== null) {
            event.preventDefault();
            move(next);
          }
        }}
      >
        {features.map(([number, title, description], index) => (
          <article
            className="feature-card"
            key={number}
            aria-labelledby={`feature-${number}`}
          >
            <div className="feature-card-copy">
              <div className="feature-card-top">
                <span className="feature-number">{number}</span>
              </div>
              <h3 id={`feature-${number}`}>{title}</h3>
              <p>{description}</p>
            </div>
            <FeaturePreview index={index} />
          </article>
        ))}
      </div>
      <div className="feature-pagination">
        <button
          type="button"
          className="secondary"
          aria-label="Previous feature"
          disabled={active === 0}
          onClick={() => move(active - 1)}
        >
          ←
        </button>
        <p role="status" aria-live="polite">
          <strong>{active + 1}</strong> / 7
          <span className="sr-only"> features</span>
        </p>
        <button
          type="button"
          className="secondary"
          aria-label="Next feature"
          disabled={active === 6}
          onClick={() => move(active + 1)}
        >
          →
        </button>
      </div>
      <noscript>
        <style>{`.feature-pagination { display: none; }`}</style>
      </noscript>
    </div>
  );
}
