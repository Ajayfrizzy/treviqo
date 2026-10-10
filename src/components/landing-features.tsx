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
            <div className="feature-card-top">
              <span className="feature-number">{number}</span>
              <svg
                className="feature-icon"
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={icons[index]} />
              </svg>
            </div>
            <h3 id={`feature-${number}`}>{title}</h3>
            <p>{description}</p>
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
