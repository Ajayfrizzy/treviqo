import Link from "next/link";
export default function NotFound() { return <section className="card"><h1>Passport entry not found</h1><p>Only your closed employments appear in Passport. This employment may have been reopened.</p><Link className="button-link" href="/passport">Return to Passport</Link></section>; }
