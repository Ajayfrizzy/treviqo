import { z } from "zod";
export const supportedTypes = [
  "employment_contract",
  "payslip",
  "resignation_letter",
  "termination_letter",
  "exit_letter",
  "final_settlement",
  "pension_statement",
  "benefit_document",
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
  exit_letter: {
    employer: "Employer",
    employee: "Employee",
    role: "Role",
    letter_date: "Letter date",
    last_working_day: "Confirmed last working day",
    exit_type: "Stated exit type",
    asset_return_wording: "Asset return / clearance wording",
    settlement_reference: "Settlement wording",
    pension_reference: "Pension wording",
  },
  benefit_document: {
    employer: "Employer",
    employee: "Employee",
    role: "Role",
    health_plan_wording: "Health plan — coverage and continuation",
    group_life_wording: "Group life — eligibility and end conditions",
    pension_wording: "Pension — account ownership wording",
    health_provider: "Health plan provider",
    group_life_provider: "Group life provider",
    pension_provider: "Pension provider",
  },
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
  needsTypeConfirmation?: boolean;
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
    "Treviqo could not verify enough reliable details from this document. Try again or enter the details manually.",
  persistence: "Details could not be saved. Retry or enter fields manually.",
  interrupted: "This attempt was interrupted. Retry or enter fields manually.",
};
export function labelFor(type: string | null, key: string) {
  if (key === "document_type") return "Document category";
  return (
    (
      fieldLabels[type as ExtractionType] as Record<string, string> | undefined
    )?.[key] ?? key
  );
}

// Shared invariant for persistence, review APIs and rendering. Unknown types
// never gain a schema through a cast or fallback field label.
export function fieldAllowed(type: string | null, key: string): boolean {
  if (key === "document_type") return true;
  return (
    !!type &&
    Object.hasOwn(fieldLabels, type) &&
    Object.hasOwn(fieldLabels[type as ExtractionType], key)
  );
}
export function reviewFields(record: ExtractionRecord) {
  if (record.needsTypeConfirmation) return [];
  return record.fields.filter(
    (field) =>
      field.key !== "document_type" &&
      fieldAllowed(record.documentType, field.key),
  );
}
const usefulManualFields: Record<ExtractionType, readonly string[]> = {
  exit_letter: [
    "employer",
    "last_working_day",
    "exit_type",
    "asset_return_wording",
  ],
  benefit_document: [
    "health_plan_wording",
    "group_life_wording",
    "pension_wording",
  ],
  employment_contract: ["employer", "role", "start_date", "notice_period"],
  payslip: ["pay_period", "gross_pay", "net_pay"],
  resignation_letter: ["letter_date", "proposed_last_day", "notice_period"],
  termination_letter: ["letter_date", "effective_date", "reason"],
  final_settlement: ["pay_period", "final_salary", "total"],
  pension_statement: [
    "provider",
    "statement_start",
    "statement_end",
    "entries_complete",
  ],
};
export function groupReviewFields(record: ExtractionRecord) {
  const fields = reviewFields(record);
  const proposed = fields.filter(
    (f) =>
      f.proposedValue !== null ||
      f.value !== null ||
      f.reviewState !== "proposed",
  );
  const empty = fields.filter((f) => !proposed.includes(f));
  const useful =
    usefulManualFields[record.documentType as ExtractionType] ?? [];
  return {
    proposed,
    manual: empty.filter((f) => useful.includes(f.key)),
    optional: empty.filter((f) => !useful.includes(f.key)),
  };
}

export function extractionReadyMessage(record: ExtractionRecord): string {
  if (
    record.needsTypeConfirmation ||
    record.errorCode === "needs_type_confirmation"
  )
    return "The file is saved, but its category needs confirmation before extraction can continue.";
  if (record.sourceKind === "manual")
    return "Manual fields are ready. Enter only details stated in your document.";
  return "Details are ready for your review. Nothing is confirmed automatically.";
}
