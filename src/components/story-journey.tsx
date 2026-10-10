"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "@/components/action-link";

const journeySteps = [
  {
    id: "employment",
    title: "Add employment",
    description:
      "Start your record with the role, employer, and dates that matter.",
    points: [
      "Track current and past roles",
      "Keep key employment details",
      "Build a continuous work history",
    ],
    caption: "A foundation for every chapter.",
    previewTitle: "Your employment record",
    rows: [
      ["Employer", "Example Company"],
      ["Role", "Product designer"],
      ["Start date", "January 2023"],
    ],
  },
  {
    id: "evidence",
    title: "Save important evidence",
    description:
      "Keep the records behind your working life in one private space.",
    points: [
      "Keep original documents together",
      "Connect evidence to the right role",
      "Use private, account-controlled access",
    ],
    caption: "The evidence stays with your record.",
    previewTitle: "Your document collection",
    rows: [
      ["Contract", "Employment contract.pdf"],
      ["Payslip", "March payslip.pdf"],
      ["Exit document", "Exit letter.pdf"],
    ],
  },
  {
    id: "review",
    title: "Review extracted details",
    description:
      "Treviqo can suggest details from your documents. You stay in control of what becomes trusted.",
    points: [
      "See the original source evidence",
      "Confirm or correct proposed details",
      "Enter information manually at any time",
    ],
    caption: "AI proposes. You decide.",
    previewTitle: "A proposal for your review",
    rows: [
      ["Field", "Notice period"],
      ["Proposed value", "30 days"],
      ["Source excerpt", "“Either party may give 30 days’ notice.”"],
    ],
  },
  {
    id: "exit",
    title: "Manage an exit",
    description: "See what to review, collect, and follow up when a role ends.",
    points: [
      "Bring your dates and evidence together",
      "Review settlement and pension items",
      "Track what still needs clarification",
    ],
    caption: "A practical next step, grounded in your records.",
    previewTitle: "Your exit checklist",
    rows: [
      ["Employment dates", "Complete"],
      ["Final-pay document", "Needs clarification"],
      ["Pension records", "Follow-up pending"],
    ],
  },
  {
    id: "history",
    title: "Keep your history",
    description:
      "Keep your employment and benefit history available after the job ends.",
    points: [
      "Revisit your closed employment records",
      "Keep benefit assessments with their evidence",
      "See unresolved details clearly labelled",
    ],
    caption: "Your next chapter starts with continuity.",
    previewTitle: "Your Benefit Passport",
    rows: [
      ["Example Company", "Jan 2023 – Aug 2025 · Closed"],
      ["Benefit assessment", "Portability needs confirmation"],
      ["Pension records", "Follow-up pending"],
    ],
  },
];

function StoryIcon({ kind }: { kind: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "employment" ? (
        <>
          <rect x="3" y="7" width="18" height="14" rx="3" />
          <path d="M8 7V4h8v3M3 12c5 3 13 3 18 0M12 12v4" />
        </>
      ) : kind === "review" ? (
        <>
          <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        </>
      ) : kind === "history" ? (
        <>
          <path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z" />
          <path d="m8 12 3 3 5-6" />
        </>
      ) : kind === "exit" ? (
        <>
          <rect x="5" y="5" width="14" height="17" rx="2" />
          <path d="M9 5V2h6v3M8 12l2 2 5-5M9 18h6" />
        </>
      ) : (
        <>
          <path d="M14 2H5v20h14V7ZM14 2v5h5M8 12h8M8 16h6" />
        </>
      )}
    </svg>
  );
}

export function StoryJourney() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function select(index: number, focus = false) {
    setSelected(index);
    if (focus) tabs.current[index]?.focus();
    tabs.current[index]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % journeySteps.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index + journeySteps.length - 1) % journeySteps.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? journeySteps.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      select(next, true);
    }
  }
  return (
    <div className="story-journey">
      <div className="story-intro">
        <p className="eyebrow">Start small. Build continuity.</p>
        <h2 id="journey-title">One record at a time.</h2>
        <p>
          From your first role to your next chapter, Treviqo helps you keep your
          working-life record together.
        </p>
        <div
          className="story-steps"
          role="tablist"
          aria-label="Your working-life journey"
        >
          {journeySteps.map((step, index) => (
            <button
              key={step.id}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              id={`story-tab-${step.id}`}
              type="button"
              role="tab"
              aria-selected={selected === index}
              aria-controls={`story-panel-${step.id}`}
              tabIndex={selected === index ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={(event) => navigate(event, index)}
            >
              <span className="story-step-number" aria-hidden="true">
                0{index + 1}
              </span>
              <span>{step.title}</span>
            </button>
          ))}
        </div>
        <p className="story-navigation-hint">
          Five steps. A record that stays with you.
        </p>
      </div>
      <div className="story-panels">
        {journeySteps.map((step, index) => (
          <div
            key={step.id}
            className="story-panel"
            id={`story-panel-${step.id}`}
            role="tabpanel"
            aria-labelledby={`story-tab-${step.id}`}
            tabIndex={0}
            hidden={selected !== index}
          >
            <StoryContent step={step} index={index} />
          </div>
        ))}
      </div>
      <MobileStoryCarousel />
      <noscript>
        <style>{`.story-steps { display: none; } .story-panel[hidden] { display: grid; } .story-panels { display: grid; gap: 1rem; }`}</style>
      </noscript>
    </div>
  );
}

function StoryContent({
  step,
  index,
  mobile = false,
}: {
  step: (typeof journeySteps)[number];
  index: number;
  mobile?: boolean;
}) {
  return (
    <>
      {" "}
      <div className="story-copy">
        <span className="story-kicker">Chapter 0{index + 1}</span>
        <h3>{step.title}</h3>
        <p>{step.description}</p>
        <ul>
          {step.points.map((point) => (
            <li key={point}>
              <span aria-hidden="true">✓</span>
              {point}
            </li>
          ))}
        </ul>
        {index === 4 && !mobile && (
          <Link className="button-link" href="/register">
            Create your account <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
      <figure className={`story-visual story-visual-${step.id}`}>
        <span className="story-icon">
          <StoryIcon kind={step.id} />
        </span>
        <div className="story-mockup">
          <p className="story-example">Illustrative example</p>
          <h4>{step.previewTitle}</h4>
          {step.id === "evidence" && (
            <p className="story-private">Private document storage</p>
          )}
          <dl>
            {step.rows.map(([label, value], row) => (
              <div
                key={label}
                className="story-preview-row"
                style={{ "--story-order": row } as React.CSSProperties}
              >
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {step.id === "review" && (
            <p className="story-review-note">
              Waiting for your confirmation or correction
            </p>
          )}
        </div>
        <figcaption>{step.caption}</figcaption>
      </figure>
    </>
  );
}

function MobileStoryCarousel() {
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  function move(index: number) {
    const container = track.current;
    const card = container?.children[index] as HTMLElement | undefined;
    if (!container || !card) return;
    container.scrollTo({
      left: card.offsetLeft - (container.children[0] as HTMLElement).offsetLeft,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  function updatePosition() {
    const container = track.current;
    if (!container) return;
    const first = (container.children[0] as HTMLElement).offsetLeft;
    let nearest = 0;
    let distance = Infinity;
    Array.from(container.children).forEach((node, index) => {
      const delta = Math.abs(
        (node as HTMLElement).offsetLeft - first - container.scrollLeft,
      );
      if (delta < distance) {
        nearest = index;
        distance = delta;
      }
    });
    setActive(nearest);
  }
  return (
    <div
      className="mobile-story"
      role="region"
      aria-roledescription="carousel"
      aria-label="Your working-life story cards"
    >
      <div className="mobile-story-controls">
        <p>Swipe to explore your next chapter</p>
        <button
          type="button"
          className="secondary"
          aria-label="Previous story"
          disabled={active === 0}
          onClick={() => move(active - 1)}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Next story"
          disabled={active === journeySteps.length - 1}
          onClick={() => move(active + 1)}
        >
          →
        </button>
      </div>
      <div
        className="mobile-story-track"
        ref={track}
        onScroll={updatePosition}
        tabIndex={0}
        aria-label="Scroll through five story cards"
        onKeyDown={(event) => {
          const next =
            event.key === "ArrowRight"
              ? Math.min(active + 1, 4)
              : event.key === "ArrowLeft"
                ? Math.max(active - 1, 0)
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 4
                    : null;
          if (next !== null) {
            event.preventDefault();
            move(next);
          }
        }}
      >
        {journeySteps.map((step, index) => (
          <article
            key={step.id}
            className="mobile-story-card"
            data-active={active === index}
            aria-roledescription="slide"
            aria-label={`${index + 1} of 5: ${step.title}`}
          >
            <StoryContent step={step} index={index} mobile />
          </article>
        ))}
      </div>
      <div
        className="mobile-story-dots"
        role="group"
        aria-label="Choose a story"
      >
        {journeySteps.map((step, index) => (
          <button
            type="button"
            key={step.id}
            aria-label={`Show story ${index + 1}: ${step.title}`}
            aria-current={active === index ? "step" : undefined}
            onClick={() => move(index)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="mobile-story-position" role="status">
        Story {active + 1} of 5
      </p>
      <Link className="button-link mobile-story-cta" href="/register">
        Create your account <span aria-hidden="true">→</span>
      </Link>
      <noscript>
        <style>{`.mobile-story-controls, .mobile-story-dots, .mobile-story-position { display: none; }`}</style>
      </noscript>
    </div>
  );
}
