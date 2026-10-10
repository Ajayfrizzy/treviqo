import Link from "@/components/action-link";
export default function MissingEmployment() {
  return (
    <section className="card">
      <h1>Employment record not found</h1>
      <p>This record is not available in your account.</p>
      <Link className="touch-link" href="/home">
        Back to Home
      </Link>
    </section>
  );
}
