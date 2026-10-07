import Link from "next/link";
export default function MissingExit() {
  return (
    <>
      <h1>Exit case not found</h1>
      <p>Open one of your exit cases or choose your employment.</p>
      <Link className="button-link" href="/exit">
        Back to Exit
      </Link>
    </>
  );
}
