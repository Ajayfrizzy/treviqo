import Link from "next/link";
import { notFound } from "next/navigation";
import { employmentPageUser } from "@/modules/employments/page-user";
import { exitService } from "@/modules/exits/service";
import { DocumentError } from "@/modules/documents/validation";
import { exitTypes, stateLabels } from "@/modules/exits/shared";
import { formatEmploymentDate } from "@/modules/employments/validation";
export default async function ExitDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await employmentPageUser(); let record;
  try { record = await exitService().detail(user.id, (await params).id); } catch (error) { if (error instanceof DocumentError && error.status === 404) notFound(); throw error; }
  const saved = (await searchParams).saved === "1";
  return <><Link className="touch-link" href="/exit">← Exit cases</Link><p className="eyebrow">{exitTypes[record.answers.exitType]}</p><h1>Your exit checklist</h1><p className="intro exit-intro">{record.employerName} · {record.roleTitle}</p>{saved && <p role="status" className="form-message">Exit details saved. Your checklist is up to date.</p>}
    <section className="card"><h2>Records and next actions</h2><p>Last working date: {formatEmploymentDate(record.answers.lastWorkingDate)}</p><p>Complete means the described check is satisfied by your answers or selected records. It does not confirm legal validity, payment, contributions, or continued benefit coverage.</p><Link className="button-link" href={`/exit/${record.id}/edit`}>Update answers</Link><p className="quiet">Evidence is checked again whenever you open this page.</p></section>
    <p className="history"><Link className="button-link" href={`/exit/${record.id}/finance`}>Review settlement and pension</Link></p><div className="exit-checklist">{record.checklist.map(item => <section className="card" aria-label={item.title} key={item.ruleId}><span className={`badge checklist-${item.state}`}>{stateLabels[item.state]}</span><h2>{item.title}</h2><p>{item.message}</p><h3>Next action</h3><p>{item.nextAction}</p>{item.evidenceRefs.length > 0 && <details><summary>Basis for this check</summary><ul>{item.evidenceRefs.map((ref, index) => <li key={index}>{ref.kind === "document" ? <Link className="touch-link" href={`/documents/${ref.id}`}>{ref.label}</Link> : ref.kind === "field" ? <Link className="touch-link" href={`/documents/${ref.documentId}/review`}>{ref.label}</Link> : ref.label}</li>)}</ul></details>}</section>)}</div>
  </>;
}
