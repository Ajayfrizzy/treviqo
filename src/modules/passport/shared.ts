import { z } from "zod";
export const benefitCategories = { pension: "Pension / RSA", hmo: "HMO", group_life: "Employer group life", employer_specific: "Employer-specific benefit", cooperative: "Cooperative benefit", provident: "Provident / retirement plan" } as const;
export type BenefitCategory = keyof typeof benefitCategories;
export const portabilityLabels = { portable: "Portable", employer_linked: "Employer-linked", unknown: "Unknown / needs confirmation" } as const;
export type Portability = keyof typeof portabilityLabels;
const optionalId = z.string().min(1).max(100).nullable();
export const assessmentSchema = z.object({
  category: z.enum(Object.keys(benefitCategories) as [BenefitCategory, ...BenefitCategory[]]),
  classification: z.enum(["portable", "employer_linked", "unknown"]),
  version: z.number().int().min(0).nullable(), contextToken: z.string().length(64),
  documentId: optionalId, fieldId: optionalId, fieldVersion: z.number().int().min(0).nullable(),
  evidenceAcknowledged: z.boolean(),
}).strict().superRefine((input, ctx) => {
  if (input.classification !== "unknown" && (!input.documentId || !input.evidenceAcknowledged)) ctx.addIssue({ code: "custom", message: "Select evidence and confirm that it supports your assessment." });
  if (Boolean(input.fieldId) !== (input.fieldVersion !== null) || (input.fieldId && !input.documentId)) ctx.addIssue({ code: "custom", message: "Select a current reviewed field and its source." });
});
export const passportCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), input: assessmentSchema }).strict(),
  z.object({ action: z.literal("remove"), category: z.enum(Object.keys(benefitCategories) as [BenefitCategory, ...BenefitCategory[]]), version: z.number().int().min(0) }).strict(),
]);
export interface PassportSummary {
  id: string; employer: string; role: string; startDate: string; endDate: string | null;
  exitType: string | null;
}
export interface PassportSource {
  id: string; label: string; fields: { id: string; version: number; category: BenefitCategory; label: string }[];
}
export interface BenefitView {
  category: BenefitCategory; classification: Portability; savedClassification: Portability;
  version: number | null; documentId: string | null; fieldId: string | null; fieldVersion: number | null;
  stale: boolean; message: string; basis: string; updatedAt: string | null;
  mentions: { documentId: string; label: string }[];
}
export interface PassportDetail extends PassportSummary {
  contextToken: string; refreshedAt: string; dateWarning: string | null;
  exit: { id: string; type: string; lastWorkingDate: string; unresolved: number; total: number } | null;
  documents: { category: string; label: string; state: string; records: { id: string; label: string; review: string }[] }[];
  pension: { participation: string; provider: string | null; providerBasis: string; providerDocuments: string[]; state: string; targetPeriod: string | null };
  benefits: BenefitView[]; sources: PassportSource[];
}
