"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main" className="content"><h1>Something went wrong</h1><p>Your space could not load. Please try again.</p><button onClick={reset}>Try again</button></main>; }
