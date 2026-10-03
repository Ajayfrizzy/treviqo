import { z } from "zod";
import { calendarDate } from "@/modules/employments/validation";
export const exitTypes = { resignation: "Resignation", termination: "Termination", redundancy: "Redundancy", contract_completion: "Contract completion", retirement: "Retirement" } as const;
export const stateLabels = { complete: "Complete", pending: "Pending", missing: "Missing", needs_clarification: "Needs clarification", not_applicable: "Not applicable" } as const;
export type ChecklistState = keyof typeof stateLabels;
const optionalId = z.string().min(1).max(100).nullable().default(null);
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);
const answer = z.enum(["unknown", "yes", "no"]).default("unknown");
const followup = z.enum(["unknown", "none", "pending", "resolved"]).default("unknown");
export const exitSchema = z.object({
  exitType: z.enum(["resignation", "termination", "redundancy", "contract_completion", "retirement"]),
  lastWorkingDate: calendarDate,
  noticeDate: calendarDate.nullable().default(null), noticeApplicable: answer,
  noticeRequirement: optionalText(1000), noticeFieldId: optionalId,
  noticeFieldVersion: z.number().int().min(0).nullable().default(null),
  finalPayDocumentId: optionalId, finalPayPeriod: optionalText(160),
  leave: followup, reimbursements: followup, reimbursementDocumentId: optionalId,
  pension: answer, pensionDetailsSaved: z.boolean().default(false),
  assets: z.enum(["unknown", "none", "held", "scheduled", "returned"]).default("unknown"), assetDocumentId: optionalId,
  exitDocumentId: optionalId,
  reference: z.enum(["unknown", "not_needed", "not_requested", "requested", "saved"]).default("unknown"), referenceDocumentId: optionalId,
  benefits: followup,
}).strict().superRefine((value, ctx) => {
  if (value.noticeFieldId && value.noticeRequirement) ctx.addIssue({ code: "custom", path: ["noticeRequirement"], message: "Choose either a reviewed field or your own notice wording." });
  if (Boolean(value.noticeFieldId) !== (value.noticeFieldVersion !== null)) ctx.addIssue({ code: "custom", path: ["noticeFieldId"], message: "Select the current reviewed notice field." });
});
export const createExitSchema = z.object({ employmentId: z.string().min(1).max(100), answers: exitSchema }).strict();
export const updateExitSchema = z.object({ version: z.number().int().min(0), answers: exitSchema }).strict();
export type ExitInput = z.output<typeof exitSchema>;
export const documentSlots = ["finalPayDocumentId", "reimbursementDocumentId", "assetDocumentId", "exitDocumentId", "referenceDocumentId"] as const;
export interface EvidenceDocument { id: string; name: string; type: string; }
export interface NoticeField { id: string; version: number; value: string; documentId: string; name: string; }
export interface ExitEvidence { documents: EvidenceDocument[]; noticeFields: NoticeField[]; employmentStart: string; }
export interface EvidenceRef { kind: "answer" | "document" | "field"; label: string; id?: string; documentId?: string; }
export interface ChecklistItem { ruleId: string; state: ChecklistState; title: string; message: string; nextAction: string; evidenceRefs: EvidenceRef[]; }
export interface ExitRecord {
  id: string; employmentId: string; employerName: string; roleTitle: string; version: number;
  createdAt: string; updatedAt: string; answers: ExitInput; rulesVersion: string; checklist: ChecklistItem[];
}
export const emptyExitInput: ExitInput = {
  exitType: "resignation", lastWorkingDate: "", noticeDate: null, noticeApplicable: "unknown",
  noticeRequirement: null, noticeFieldId: null, noticeFieldVersion: null,
  finalPayDocumentId: null, finalPayPeriod: null, leave: "unknown", reimbursements: "unknown", reimbursementDocumentId: null,
  pension: "unknown", pensionDetailsSaved: false, assets: "unknown", assetDocumentId: null,
  exitDocumentId: null, reference: "unknown", referenceDocumentId: null, benefits: "unknown",
};
