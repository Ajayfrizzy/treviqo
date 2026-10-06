import Link from "next/link";
import { employmentPageUser } from "@/modules/employments/page-user";
import { passportService } from "@/modules/passport/service";
import { formatEmploymentDate } from "@/modules/employments/validation";
import { exitTypes } from "@/modules/exits/shared";
export default async function PassportPage() {
  const user = await employmentPageUser(); const entries = await passportService().list(user.id);
  return <><p className="eyebrow">Your working history</p><h1>Benefit Passport</h1><p className="intro">Your closed employments, records and benefit history in one place.</p><p>These are your personal records, not employer verification or a legal certificate. Summaries reflect current source records.</p>
    {!entries.length ? <section className="card"><h2>No closed employments yet</h2><p>When you mark an employment Closed, its existing details will appear here. An exit checklist does not close employment automatically.</p><Link className="button-link" href="/">Manage employment</Link></section> : <ol className="passport-timeline" aria-label="Closed employment history">{entries.map(entry => <li key={entry.id}><article className="card"><span className="badge">Closed · worker-entered</span><h2>{entry.employer}</h2><p>{entry.role}</p><p>{formatEmploymentDate(entry.startDate)} – {entry.endDate ? formatEmploymentDate(entry.endDate) : "End date unknown"}</p><p>Exit: {entry.exitType ? exitTypes[entry.exitType as keyof typeof exitTypes] : "Not recorded"}</p><Link className="button-link" href={`/passport/${entry.id}`}>View Passport entry</Link></article></li>)}</ol>}
  </>;
}
