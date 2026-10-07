"use client";
import { RetryButton } from "@/components/retry-button";
export default function DocumentsError({ reset }: { reset: () => void }) {
  return (
    <section className="card" role="alert">
      <h1>Documents could not load</h1>
      <p>Please try again in a moment.</p>
      <RetryButton reset={reset} />
    </section>
  );
}
