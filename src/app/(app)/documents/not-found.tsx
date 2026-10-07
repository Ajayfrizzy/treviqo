import Link from "next/link";
export default function MissingDocument() {
  return (
    <section className="card">
      <h1>Document not found</h1>
      <p>This document is not available in your account.</p>
      <Link className="touch-link" href="/documents">
        Back to Documents
      </Link>
    </section>
  );
}
