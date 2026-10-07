"use client";
export default function ExitError({ reset }: { reset: () => void }) {
  return (
    <section className="card">
      <h1>Unable to load your exit checklist</h1>
      <p>Your saved answers are kept. Please try again.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
