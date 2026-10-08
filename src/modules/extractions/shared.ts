import { z } from "zod";
export const supportedTypes = [
  "employment_contract",
  "payslip",
  "resignation_letter",
  "termination_letter",
  "final_settlement",
  "pension_statement",
] as const;
export type ExtractionType = (typeof supportedTypes)[number];
const pensionRows = Object.fromEntries(
  [1, 2, 3].flatMap((index) =>
    Object.entries({
      employer: "Employer",
      period: "Contribution period",
      date: "Posting date",
      employee_amount: "Employee contribution",
      employer_amount: "Employer contribution",
    }).map(([key, label]) => [
      `contribution_${index}_${key}`,
      `Entry ${index}: ${label}`,
    ]),
  ),
);
export const fieldLabels = {
  final_settlement: {
    pay_period: "Pay period",
    final_salary: "Final salary",
    leave: "Leave settlement",
    reimbursement: "Reimbursement",
    bonus: "Bonus / commission",
    pension_deduction: "Pension deduction",
    loan_deduction: "Loan deduction",
    other_deduction: "Other deductions",
    total: "Total settlement",
  },
  pension_statement: {
    provider: "Pension provider",
    statement_start: "Statement coverage from (month)",
    statement_end: "Statement coverage through (month)",
    entries_complete:
      "Does this extraction include every contribution entry? (yes/no)",
    ...pensionRows,
  },
  employment_contract: {
    employer: "Employer",
    employee: "Employee",
    role: "Role",
    start_date: "Start date",
    employment_type: "Employment type",
    salary: "Salary amount and currency",
    salary_frequency: "Salary frequency",
    notice_period: "Notice period",
    annual_leave: "Annual leave",
    probation: "Probation",
    pension_reference: "Pension wording",
    hmo_reference: "HMO wording",
    group_life_reference: "Group-life wording",
    exit_clause: "Exit clause",
  },
  payslip: {
    employer: "Employer",
    employee: "Employee",
    pay_period: "Pay period",
    gross_pay: "Gross pay",
    net_pay: "Net pay",
    basic_salary: "Basic salary",
    pension_deduction: "Pension deduction",
    tax: "Tax",
    other_deductions: "Other deductions",
    reimbursements: "Explicit reimbursements",
    allowances: "Allowances",
  },
  resignation_letter: {
    letter_date: "Letter date",
    notice_date: "Notice date",
    proposed_last_day: "Proposed last day",
    notice_period: "Stated notice period",
    reason: "Explicit reason",
  },
  termination_letter: {
    letter_date: "Letter date",
    effective_date: "Effective date",
    reason: "Stated reason",
    notice_wording: "Notice / pay-in-lieu wording",
    settlement_reference: "Settlement wording",
    benefit_termination: "Benefit termination wording",
  },
} as const;
export const confidenceSchema = z.enum([
  "high",
  "medium",
  "low",
  "needs_review",
]);
export const MAX_SOURCE_CHARS = 18000;
export const startSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("ai"),
      text: z.string().trim().min(20).max(MAX_SOURCE_CHARS).optional(),
      type: z.enum(supportedTypes).optional(),
    })
    .strict(),
  z
    .object({ mode: z.literal("manual"), type: z.enum(supportedTypes) })
    .strict(),
]);
export const reviewSchema = z
  .object({
    fieldId: z.string().uuid(),
    version: z.number().int().min(0),
    action: z.enum(["confirm", "correct", "reject", "unknown"]),
    value: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.action === "correct" && !input.value)
      ctx.addIssue({
        code: "custom",
        message: "Enter a corrected value.",
        path: ["value"],
      });
    if (input.action !== "correct" && input.value !== undefined)
      ctx.addIssue({
        code: "custom",
        message: "Only corrections accept a value.",
        path: ["value"],
      });
  });
export type ReviewState =
  "proposed" | "confirmed" | "corrected" | "rejected" | "unknown";
export interface ReviewField {
  id: string;
  key: string;
  proposedValue: string | null;
  value: string | null;
  evidence: string | null;
  confidence: z.infer<typeof confidenceSchema>;
  reviewState: ReviewState;
  version: number;
  revisions: {
    id: string;
    state: ReviewState;
    value: string | null;
    createdAt: string;
  }[];
}
export interface ExtractionRecord {
  id: string;
  status: "processing" | "ready" | "failed";
  documentType: string | null;
  sourceKind: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  errorCode: string | null;
  createdAt: string;
  fields: ReviewField[];
}
export const failureMessages: Record<string, string> = {
  unreadable:
    "No usable text was found. Paste text from this document or enter fields manually.",
  too_large:
    "This document is too long for one extraction. Enter the key fields manually.",
  unavailable: "AI is unavailable. Try again later or enter fields manually.",
  timeout:
    "AI took too long to respond. Try again later or enter fields manually.",
  malformed:
    "The model response could not be verified. Retry or enter fields manually.",
  persistence: "Details could not be saved. Retry or enter fields manually.",
  interrupted: "This attempt was interrupted. Retry or enter fields manually.",
};
export function labelFor(type: string | null, key: string) {
  if (key === "document_type") return "Suggested document category";
  return (
    (
      fieldLabels[type as ExtractionType] as Record<string, string> | undefined
    )?.[key] ?? key
  );
}
