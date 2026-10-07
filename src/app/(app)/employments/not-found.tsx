import Link from "next/link";
export default function MissingEmployment() {
  return (
    <section className="card">
      <h1>Employment record not found</h1>
      <p>This record is not available in your account.</p>
      <Link className="touch-link" href="/">
        Back to Home
      </Link>
    </section>
  );
}
