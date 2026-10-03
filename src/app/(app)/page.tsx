import Link from "next/link";
import { employmentPageUser } from "@/modules/employments/page-user";
import { listEmployments } from "@/modules/employments/service";
import { groupEmployments } from "@/modules/employments/validation";
import { EmploymentCard } from "@/components/employment-card";
export default async function Home() {
  const user = await employmentPageUser();
  const records = await listEmployments(user.id);
  const { current, previous } = groupEmployments(records);
  return <><p className="eyebrow">Your Treviqo</p><h1>Your working life.</h1><p className="intro">Your roles and your history, together in a space that belongs to you.</p>
    {!records.length ? <section className="card empty-employment"><span className="badge">Start here</span><h2>Make room for your working life</h2><p>Add your employer, role, and start date. You can fill in the rest as you go.</p><Link className="button-link" href="/employments/new">Add your first employment</Link></section> : <>
      <div className="section-heading"><h2>Current employment</h2><Link className="touch-link" href="/employments/new">Add employment</Link></div>
      {current.length ? <div className="employment-list">{current.map(record => <EmploymentCard key={record.id} employment={record} />)}</div> : <section className="card"><p>No current employment recorded. Your previous roles are kept below.</p></section>}
      <section aria-labelledby="previous-heading" className="history"><h2 id="previous-heading">Previous employment</h2>{previous.length ? <div className="employment-list">{previous.map(record => <EmploymentCard key={record.id} employment={record} />)}</div> : <p>No previous employment recorded yet.</p>}</section>
    </>}
    <section className="card exit-context"><h2>No active exit process</h2><p>A guided exit process will be available in a future update.</p></section>
  </>;
}
