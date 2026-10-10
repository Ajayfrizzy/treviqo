"use client";

import { useState } from "react";

const chapters = [
  {
    label: "Employment",
    title: "Every chapter. One place.",
    rows: [
      [
        "Your foundation",
        "Employment history",
        "Roles, dates and the evidence behind them",
      ],
      [
        "Your next step",
        "An exit, with a checklist",
        "Details to review. Actions to follow up.",
      ],
      [
        "Yours to carry forward",
        "Your Benefit Passport",
        "A record that stays with you",
      ],
    ],
    note: "A continuous personal record",
    detail: "Start with one role. Add to it as your working life changes.",
  },
  {
    label: "Documents",
    title: "Your evidence. Within reach.",
    rows: [
      ["Save", "Employment contract", "Keep the original document as evidence"],
      [
        "Review",
        "AI-proposed details",
        "Check and correct important information",
      ],
      ["Confirm", "Your reviewed record", "Manual entry is always available"],
    ],
    note: "Contract saved",
    detail: "Private evidence · Ready for your review",
  },
  {
    label: "Next chapter",
    title: "A clearer way forward.",
    rows: [
      [
        "Prepare",
        "Your exit checklist",
        "Bring your dates and reviewed evidence together",
      ],
      [
        "Follow up",
        "Settlement and pension items",
        "Track details that need clarification",
      ],
      [
        "Keep",
        "Employment and benefit history",
        "Carry closed employment records forward",
      ],
    ],
    note: "Your next step, in view",
    detail: "A practical checklist, not a legal determination.",
  },
];

export function HeroPreview() {
  const [selected, setSelected] = useState(0);
  return (
    <div className="record-preview" aria-label="Illustrative personal record">
      <div className="preview-top">
        <span className="preview-mark" aria-hidden="true">
          t.
        </span>
        <span>
          Your working-life record<small>Illustrative example</small>
        </span>
        <span className="preview-dot" aria-hidden="true" />
      </div>
      <p className="preview-hint">Choose a chapter to explore</p>
      <div
        className="preview-choices"
        role="group"
        aria-label="Explore example chapters"
      >
        {chapters.map((chapter, index) => (
          <button
            key={chapter.label}
            type="button"
            aria-pressed={selected === index}
            aria-controls={`chapter-${index}`}
            onClick={() => setSelected(index)}
          >
            {chapter.label}
          </button>
        ))}
      </div>
      <div className="chapter-stack">
        {chapters.map((chapter, index) => (
          <div
            key={chapter.label}
            id={`chapter-${index}`}
            className="chapter-panel"
            data-active={selected === index}
            aria-hidden={selected !== index}
            inert={selected !== index}
          >
            <div className="preview-title">
              <h2>{chapter.title}</h2>
            </div>
            <ol className="preview-timeline">
              {chapter.rows.map(([label, title, detail]) => (
                <li key={title}>
                  <span className="record-date">{label}</span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </li>
              ))}
            </ol>
            <div className="preview-document">
              <span aria-hidden="true">▤</span>
              <div>
                <strong>{chapter.note}</strong>
                <small>{chapter.detail}</small>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const steps = [
  [
    "Add employment",
    "Start with the essentials",
    "Add your employer, role and start date. You can build the rest of your record over time.",
    "Your role → Your dates → Your record",
  ],
  [
    "Save important evidence",
    "Give your documents a home",
    "Save a contract, payslip or other employment document alongside the role it belongs to.",
    "Original document → Private storage",
  ],
  [
    "Review extracted details",
    "You have the final say",
    "AI proposes information from your document. Confirm or correct important details, or enter them manually.",
    "Proposed → Reviewed by you → Confirmed",
  ],
  [
    "Manage an exit when needed",
    "See the next practical action",
    "Bring dates, evidence and answers together in an exit checklist. Follow up on settlement and pension items that need clarification.",
    "Your evidence → Checklist → Follow-up",
  ],
  [
    "Keep your employment and benefit history",
    "Carry your history forward",
    "Find closed employment records and benefit assessments in your Benefit Passport, with unresolved details clearly labelled.",
    "Closed employment → Benefit Passport",
  ],
];

export function JourneyPreview() {
  const [selected, setSelected] = useState<number | null>(0);
  return (
    <>
      <p>Choose a step to see how it fits together.</p>
      <ol className="interactive-journey">
        {steps.map(([label, title, description, trail], index) => (
          <li key={label} data-active={selected === index}>
            <h3>
              <button
                type="button"
                aria-expanded={selected === index}
                aria-controls={`journey-${index}`}
                onClick={() => setSelected(selected === index ? null : index)}
              >
                <span className="journey-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <span>{label}</span>
                <span className="journey-toggle" aria-hidden="true">
                  {selected === index ? "−" : "+"}
                </span>
              </button>
            </h3>
            <div
              id={`journey-${index}`}
              hidden={selected !== index}
              className="journey-detail"
            >
              <p className="eyebrow">Illustrative walkthrough</p>
              <h4>{title}</h4>
              <p>{description}</p>
              <p className="journey-trail">{trail}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
