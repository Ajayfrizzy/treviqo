"use client";
import { RetryButton } from "@/components/retry-button";
export default function ExitError({ reset }: { reset: () => void }) {
  return (
    <section className="card">
      <h1>Unable to load your exit checklist</h1>
      <p>Your saved answers are kept. Please try again.</p>
      <RetryButton reset={reset} />
    </section>
  );
}
