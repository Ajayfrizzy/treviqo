import Link from "next/link";
import { notFound } from "next/navigation";
import { employmentPageUser } from "@/modules/employments/page-user";
import { listEmployments } from "@/modules/employments/service";
import { exitService } from "@/modules/exits/service";
import { ExitForm } from "@/components/exit-form";
export default async function NewExit({ searchParams }: { searchParams: Promise<{ employmentId?: string }> }) {
  const user = await employmentPageUser(); const jobs = await listEmployments(user.id); const existing = await exitService().list(user.id); const selected = (await searchParams).employmentId;
  if (!selected) return <><Link className="touch-link" href="/exit">← Exit</Link><h1>Choose your employment</h1>{jobs.length ? <div className="employment-list">{jobs.map(job => { const current = existing.find(item => item.employmentId === job.id); return <article className="card exit-job" key={job.id}><h2>{job.employerName}</h2><p>{job.roleTitle}</p><Link className="touch-link" href={current ? `/exit/${current.id}` : `/exit/new?employmentId=${job.id}`}>{current ? "Open existing checklist" : "Choose employment"}</Link></article>; })}</div> : <section className="card"><h2>Add an employment first</h2><p>An exit checklist belongs to one of your employment records.</p><Link className="button-link" href="/employments/new">Add employment</Link></section>}</>;
  const job = jobs.find(job => job.id === selected); if (!job) notFound();
  const current = existing.find(item => item.employmentId === selected);
  if (current) return <><h1>Checklist already started</h1><Link className="button-link" href={`/exit/${current.id}`}>Open existing checklist</Link></>;
  const evidence = await exitService().evidence(user.id, selected);
  return <><Link className="touch-link" href="/exit/new">← Choose employment</Link><h1>Start your exit checklist</h1><ExitForm employmentId={selected} employerName={job.employerName} evidence={evidence} /></>;
}
