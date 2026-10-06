import { createHash } from "node:crypto";
import type { ExitRecord } from "@/modules/exits/shared";
import type { PensionView } from "@/modules/finance/shared";
export const DAY = 86400000;
export interface ReminderCandidate { key: string; kind: "exit_action" | "missing_document" | "pension_followup" | "stale_action"; dueAt: Date; fingerprint: string; title: string; message: string; href: string; }
export function reminderCandidates(exit: ExitRecord, pension: PensionView | null, now: Date): ReminderCandidate[] {
  const result: ReminderCandidate[]=[];
  const add=(key:string,kind:ReminderCandidate["kind"],dueAt:Date,title:string,message:string,identity:unknown,href=`/exit/${exit.id}`)=>result.push({key,kind,dueAt,title,message,href,fingerprint:createHash("sha256").update(JSON.stringify({version:"reminders-v1",key,kind,dueAt,identity})).digest("hex")});
  const unresolved=exit.checklist.filter(item=>!["complete","not_applicable"].includes(item.state));
  // Follow-up conventions, never statutory deadlines. Date-only values use UTC.
  const firstDue=new Date(Math.min(new Date(exit.createdAt).getTime()+DAY,new Date(`${exit.answers.lastWorkingDate}T00:00:00Z`).getTime()));
  for(const item of unresolved) {
    const missing=item.state==="missing"&&["final_salary","reimbursements","assets","exit_documents","reference"].includes(item.ruleId);
    add(item.ruleId,missing?"missing_document":"exit_action",firstDue,item.title,missing?"A required record is not currently selected. Review the checklist and save the relevant evidence.":"This checklist item still needs your attention. Review current answers and evidence.",{state:item.state,message:item.message,refs:item.evidenceRefs});
  }
  if(unresolved.length&&now.getTime()-new Date(exit.updatedAt).getTime()>=7*DAY) add("stale_action","stale_action",new Date(new Date(exit.updatedAt).getTime()+7*DAY),"Review unchanged exit actions","Your exit answers have not been updated for at least seven days and some actions remain unresolved.",{updatedAt:exit.updatedAt,items:unresolved.map(item=>[item.ruleId,item.state])});
  if(pension&&exit.answers.pension==="yes"&&pension.result.state!=="confirmed"&&pension.followUpDate) add("pension_followup","pension_followup",new Date(`${pension.followUpDate}T00:00:00Z`),"Pension follow-up","Your saved follow-up date is due. Review the current statement and final-contribution check; this is not a nonpayment finding.",{period:pension.targetPeriod,state:pension.result.state,token:pension.evidenceToken},`/exit/${exit.id}/finance`);
  return result;
}
export function reminderVisible(row:{state:string;fingerprint:string;snoozedUntil:Date|null},candidate:ReminderCandidate,now:Date) {
  if(candidate.dueAt>now)return false;
  if(row.fingerprint!==candidate.fingerprint||row.state==="resolved")return true;
  return row.state!=="dismissed"&&!(row.state==="snoozed"&&row.snoozedUntil&&row.snoozedUntil>now);
}
