import { calendarDate } from "@/modules/employments/validation";
import { exitTypes, type ChecklistItem, type ChecklistState, type EvidenceRef, type ExitEvidence, type ExitInput } from "./shared";
export const RULES_VERSION = "exit-checker-v1";
const answerRef = (label: string): EvidenceRef => ({ kind: "answer", label: `Your answer: ${label}` });
// No language model, current clock, database, money arithmetic or external legal assumptions.
export function noticeDeadline(date: string, wording: string): string | null {
  if (!calendarDate.safeParse(date).success) return null;
  const match = /^(\d{1,3})\s+(calendar\s+)?(days?|weeks?|months?)$/i.exec(wording.trim());
  if (!match || (match[2] && !match[3]!.toLowerCase().startsWith("day"))) return null;
  const amount = Number(match[1]); const unit = match[3]!.toLowerCase(); const result = new Date(`${date}T00:00:00Z`);
  if (unit.startsWith("month")) {
    if (amount > 24) return null;
    const day = result.getUTCDate(); result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + amount);
    const end = new Date(result); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
    result.setUTCDate(Math.min(day, end.getUTCDate()));
  } else {
    const days = amount * (unit.startsWith("week") ? 7 : 1); if (days > 730) return null;
    result.setUTCDate(result.getUTCDate() + days);
  }
  const value = result.toISOString().slice(0, 10); return calendarDate.safeParse(value).success ? value : null;
}
export function buildChecklist(input: ExitInput, evidence: ExitEvidence): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const add = (ruleId: string, title: string, state: ChecklistState, message: string, nextAction: string, refs: EvidenceRef[] = []) => items.push({ ruleId, title, state, message, nextAction, evidenceRefs: refs });
  const doc = (id: string | null) => evidence.documents.find(item => item.id === id);
  const ref = (id: string | null): EvidenceRef[] => { const found = doc(id); return found ? [{ kind: "document", id: found.id, label: found.name }] : []; };
  const noticeRefs = [answerRef("notice applicability and dates")];
  let wording = input.noticeRequirement;
  const field = evidence.noticeFields.find(field => field.id === input.noticeFieldId && field.version === input.noticeFieldVersion);
  if (field) { wording = field.value; noticeRefs.push({ kind: "field", id: field.id, documentId: field.documentId, label: `${field.name}: reviewed notice wording` }); }
  else if (wording) noticeRefs.push(answerRef(`notice wording: ${wording}`));
  const deadline = wording && input.noticeDate ? noticeDeadline(input.noticeDate, wording) : null;
  if (input.lastWorkingDate < evidence.employmentStart || (input.noticeDate && input.noticeDate > input.lastWorkingDate)) add("notice", "Notice and dates", "needs_clarification", "Your exit dates are out of order or precede the employment start date.", "Check the employment start, communication date, and last working date.", noticeRefs);
  else if (input.noticeApplicable === "no") add("notice", "Notice and dates", "not_applicable", "You reported that a notice-period comparison does not apply. This is not a legal finding.", "Keep the relevant agreement or decision and revisit this answer if it changes.", noticeRefs);
  else if (input.noticeApplicable === "unknown") add("notice", "Notice and dates", "needs_clarification", "Whether a notice-period comparison applies has not been confirmed.", "Review the relevant agreement or ask your employer about the applicable notice arrangement.", noticeRefs);
  else if (input.noticeFieldId && !field) add("notice", "Notice and dates", "needs_clarification", "The selected reviewed notice field changed or is no longer available as confirmed evidence.", "Reselect a current confirmed field, or enter the notice wording yourself.", noticeRefs);
  else if (!wording || !input.noticeDate) add("notice", "Notice and dates", "missing", "The notice wording or notice/decision communication date is missing.", "Add the applicable notice wording and communication date.", noticeRefs);
  else if (!deadline) add("notice", "Notice and dates", "needs_clarification", "The notice wording cannot be compared safely as a simple calendar duration.", "Clarify working days, alternatives, waivers, pay-in-lieu or conditional clauses with your employer; keep the original wording.", noticeRefs);
  else if (input.lastWorkingDate < deadline) add("notice", "Notice and dates", "needs_clarification", `The submitted dates end before ${deadline}, the comparison date for “${wording}”. This does not determine legal validity.`, "Confirm the dates and any agreed variation with your employer.", noticeRefs);
  else add("notice", "Notice and dates", "complete", `Your submitted dates appear consistent with “${wording}” using a calendar comparison ending ${deadline}.`, "Retain the notice and any acknowledgement. This checks dates only.", noticeRefs);

  if (!doc(input.finalPayDocumentId)) add("final_salary", "Final salary records", "missing", "A current final payslip or settlement record has not been selected for this exit.", "Upload or select the final-pay record and identify the pay period. This does not check payment amounts.", []);
  else if (!["payslip", "final_settlement"].includes(doc(input.finalPayDocumentId)!.type)) add("final_salary", "Final salary records", "needs_clarification", "The selected record is not categorised as a payslip or final-settlement document.", "Select the relevant final-pay record; do not assume an unrelated file proves payment.", ref(input.finalPayDocumentId));
  else if (!input.finalPayPeriod) add("final_salary", "Final salary records", "needs_clarification", "A final-pay record is selected, but its pay period is not identified.", "Read the record and enter its pay period, or request clarification.", ref(input.finalPayDocumentId));
  else add("final_salary", "Final salary records", "complete", `You selected a final-pay record and identified its period as “${input.finalPayPeriod}”. Amounts, payment and period coverage have not been verified.`, "Keep the record and confirm any questions about payment with your employer.", [...ref(input.finalPayDocumentId), answerRef("final-pay period")]);

  function followup(ruleId: string, title: string, value: ExitInput["leave"], subject: string, refs: EvidenceRef[] = []) {
    refs = [answerRef(subject), ...refs];
    if (value === "unknown") add(ruleId, title, "needs_clarification", `Your ${subject} position is not yet clear.`, `Check the relevant records and clarify ${subject} with your employer.`, refs);
    else if (value === "none") add(ruleId, title, "not_applicable", `You reported no ${subject} requiring follow-up.`, "Keep that confirmation and update this answer if new information appears.", refs);
    else if (value === "pending") add(ruleId, title, "pending", `You reported unresolved ${subject}. No payment or entitlement is assumed.`, "Request clarification and retain the response; update this answer when resolved.", refs);
    else add(ruleId, title, "complete", `You reported that ${subject} arrangements are clarified. This is a worker-reported status, not independent verification.`, "Keep the written clarification with your employment records.", refs);
  }
  followup("unused_leave", "Unused leave", input.leave, "unused leave");
  if (input.reimbursements === "pending" && !doc(input.reimbursementDocumentId)) add("reimbursements", "Reimbursements", "missing", "You reported an outstanding reimbursement, but no current claim/approval evidence is selected.", "Save the expense or approval evidence and request a status update. No settlement comparison is performed.", [answerRef("outstanding reimbursements")]);
  else followup("reimbursements", "Reimbursements", input.reimbursements, "reimbursements", ref(input.reimbursementDocumentId));

  if (input.pension === "unknown") add("pension", "Pension records", "needs_clarification", "Pension participation has not been confirmed.", "Check your contract or payslip, or ask for the scheme/provider details.", [answerRef("pension participation")]);
  else if (input.pension === "no") add("pension", "Pension records", "not_applicable", "You reported no pension participation for this employment.", "Revisit this answer if scheme information becomes available.", [answerRef("pension participation")]);
  else if (!input.pensionDetailsSaved) add("pension", "Pension records", "missing", "You reported pension participation, but have not confirmed that provider/contact details are saved.", "Save your provider/contact information privately. Do not enter PINs or login credentials here.", [answerRef("pension records")]);
  else add("pension", "Pension records", "complete", "You reported that pension provider/contact details are saved. Final contributions have not been verified.", "Retain your pension records for a later contribution check.", [answerRef("pension details saved")]);

  if (input.assets === "unknown") add("assets", "Company assets", "needs_clarification", "Whether company assets need to be returned is unknown.", "Confirm the asset list and return process with your employer.", [answerRef("company assets")]);
  else if (input.assets === "none") add("assets", "Company assets", "not_applicable", "You reported no company assets to return.", "Keep any written confirmation and update this answer if needed.", [answerRef("company assets")]);
  else if (input.assets === "held" || input.assets === "scheduled") add("assets", "Company assets", "pending", input.assets === "scheduled" ? "You reported that asset return is scheduled." : "You reported that company assets are still held.", "Complete the agreed handover and save an acknowledgement.", [answerRef("asset return")]);
  else if (!doc(input.assetDocumentId)) add("assets", "Company assets", "missing", "You reported assets returned, but no current acknowledgement is selected.", "Upload or select the return acknowledgement.", [answerRef("assets returned")]);
  else add("assets", "Company assets", "complete", "You reported assets returned and selected an acknowledgement. Its contents have not been independently verified.", "Keep the acknowledgement for your records.", [answerRef("assets returned"), ...ref(input.assetDocumentId)]);

  if (!doc(input.exitDocumentId)) add("exit_documents", "Exit documents", "missing", `No current ${exitTypes[input.exitType].toLowerCase()} evidence is selected.`, input.exitType === "contract_completion" ? "Save the contract end-date record or completion acknowledgement." : `Save the relevant ${exitTypes[input.exitType].toLowerCase()} letter or acknowledgement.`, []);
  else add("exit_documents", "Exit documents", "complete", `You selected evidence for your ${exitTypes[input.exitType].toLowerCase()}. The selection does not establish legal validity.`, "Keep the original and any employer acknowledgement.", ref(input.exitDocumentId));

  if (input.reference === "unknown") add("reference", "Reference / employment evidence", "needs_clarification", "Your need for a reference or employment confirmation is not yet clear.", "Decide which employment evidence you want to keep and ask how to obtain it.", [answerRef("reference needs")]);
  else if (input.reference === "not_needed") add("reference", "Reference / employment evidence", "not_applicable", "You reported that no additional reference or employment evidence is needed.", "Keep the records you already have.", [answerRef("reference needs")]);
  else if (input.reference === "not_requested" || input.reference === "requested") add("reference", "Reference / employment evidence", "pending", input.reference === "requested" ? "You reported requesting employment evidence and are waiting for it." : "You want employment evidence but have not requested it yet.", "Request or follow up on a reference/employment confirmation, then save it.", [answerRef("reference request")]);
  else if (!doc(input.referenceDocumentId)) add("reference", "Reference / employment evidence", "missing", "You reported evidence saved, but no current document is selected.", "Upload or select the reference/employment confirmation.", [answerRef("reference saved")]);
  else add("reference", "Reference / employment evidence", "complete", "You selected the employment evidence you reported saving.", "Keep the original for future use.", ref(input.referenceDocumentId));
  followup("benefits", "Employer-linked benefits", input.benefits, "employer-linked benefit end dates and contacts");
  return items;
}
