import Link from "@/components/action-link";
export default function NotFound() {
  return (
    <main id="main" className="welcome">
      <h1>Page not found</h1>
      <p>This page may have moved.</p>
      <Link href="/">Back to Treviqo</Link>
    </main>
  );
}
