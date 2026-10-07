"use client";
export default function DocumentsError({ reset }: { reset: () => void }) {
  return (
    <section className="card" role="alert">
      <h1>Documents could not load</h1>
      <p>Please try again in a moment.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
