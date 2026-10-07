import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="welcome">
      <h1>Page not found</h1>
      <p>This page may have moved.</p>
      <Link href="/">Back to Home</Link>
    </main>
  );
}
