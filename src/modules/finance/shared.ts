import { z } from "zod";
import { calendarDate } from "@/modules/employments/validation";
export const categories = {
  final_salary: "Final salary",
  leave: "Leave settlement",
  reimbursement: "Reimbursement",
  bonus: "Bonus / commission",
  pension_deduction: "Pension deduction",
  loan_deduction: "Loan deduction",
  other_deduction: "Other deductions",
  total: "Total settlement",
} as const;
export type Category = keyof typeof categories;
export const expectedKeys: Record<Category, string[]> = {
  final_salary: ["salary", "basic_salary", "gross_pay", "net_pay"],
  leave: ["leave"],
  reimbursement: ["reimbursements", "reimbursement"],
  bonus: ["allowances", "bonus"],
  pension_deduction: ["pension_deduction"],
  loan_deduction: ["loan_deduction", "other_deductions"],
  other_deduction: ["other_deductions", "other_deduction", "tax"],
  total: ["total", "net_pay"],
};
export const month = z
  .string()
  .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM.");
const id = z.string().min(1).max(100);
const version = z.number().int().min(0);
export const settlementSchema = z
  .object({
    id: id.optional(),
    version: version.optional(),
    category: z.enum(Object.keys(categories) as [Category, ...Category[]]),
    label: z.string().trim().min(1).max(160),
    documentId: id,
    expectedFieldId: id,
    expectedFieldVersion: version,
    actualFieldId: id.nullable(),
    actualFieldVersion: version.nullable(),
    expectedPeriod: month,
    actualPeriod: month,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Boolean(value.id) !== (value.version !== undefined))
      ctx.addIssue({
        code: "custom",
        message: "A saved item requires its version.",
      });
    if (Boolean(value.actualFieldId) !== (value.actualFieldVersion !== null))
      ctx.addIssue({
        code: "custom",
        message: "Select a current settlement field.",
      });
  });
export const pensionSchema = z
  .object({
    version,
    targetPeriod: month,
    statementRunId: id.nullable(),
    expectedFieldId: id.nullable(),
    expectedFieldVersion: version.nullable(),
    followUpDate: calendarDate.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      Boolean(value.expectedFieldId) !==
      (value.expectedFieldVersion !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Select a current expected contribution.",
      });
  });
export const commandSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("settlement_save"), item: settlementSchema })
    .strict(),
  z.object({ action: z.literal("settlement_remove"), id, version }).strict(),
  z.object({ action: z.literal("pension_start") }).strict(),
  z
    .object({ action: z.literal("pension_save"), input: pensionSchema })
    .strict(),
  z
    .object({
      action: z.literal("pension_confirm"),
      version,
      evidenceToken: z.string().length(64),
    })
    .strict(),
]);
export interface ReviewedField {
  id: string;
  version: number;
  key: string;
  value: string;
  documentId: string;
  documentName: string;
  type: string;
  runId: string;
}
export interface Run {
  id: string;
  documentId: string;
  name: string;
  fields: ReviewedField[];
  incomplete: boolean;
}
export interface Decision {
  state: string;
  message: string;
  nextAction: string;
}
export interface SettlementView extends z.infer<typeof settlementSchema> {
  id: string;
  version: number;
  result: Decision;
  expectedValue: string | null;
  actualValue: string | null;
}
export interface PensionView extends z.infer<typeof pensionSchema> {
  id: string;
  result: Decision;
  evidenceToken: string;
  confirmedAt: string | null;
}
export interface FinanceView {
  exitCaseId: string;
  employerName: string;
  pensionApplicable: boolean;
  defaultPeriod: string;
  documents: { id: string; name: string }[];
  fields: ReviewedField[];
  runs: Run[];
  items: SettlementView[];
  pension: PensionView | null;
}
