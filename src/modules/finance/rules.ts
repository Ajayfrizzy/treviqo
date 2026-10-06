import { calendarDate } from "@/modules/employments/validation";
import { month, type Decision, type ReviewedField, type Run } from "./shared";
export const FINANCE_RULES_VERSION = "finance-v1";
// Exact decimal minor units, no floating arithmetic, FX, aggregation, proration or statutory assumptions.
export function money(value: string): { currency: string; minor: bigint } | null {
  const match = /^(NGN|USD|GBP|EUR|₦)\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const digits = match[2]!.replaceAll(",", ""); if (digits.length > 12) return null;
  return { currency: match[1] === "₦" ? "NGN" : match[1]!, minor: BigInt(digits) * 100n + BigInt((match[3] ?? "").padEnd(2, "0")) };
}
const clarify = (message: string): Decision => ({ state: "needs_clarification", message, nextAction: "Review the source records and confirm the position with your employer or pension provider." });
export function compareSettlement(input: { currentDocument: boolean; duplicate: boolean; expected: ReviewedField | undefined; actual: ReviewedField | undefined; actualSelected: boolean; expectedPeriod: string; actualPeriod: string }): Decision {
  if (!input.currentDocument || !input.expected || (input.actualSelected && !input.actual)) return clarify("Selected evidence changed, was rejected, or is no longer available. Reselect current reviewed evidence.");
  if (input.duplicate) return clarify("This field is used by another comparison item. Resolve duplicate or overlapping selections before comparing.");
  if (input.expectedPeriod !== input.actualPeriod) return clarify("The periods you identified differ. No proration or cross-period comparison was performed.");
  const expected = money(input.expected.value); if (!expected) return clarify("The expected amount has ambiguous currency, precision, or wording. Correct and confirm one explicit amount before comparing.");
  if (!input.actualSelected) return { state: "not_identified", message: `The reviewed ${input.expected.value} item was not identified by you in the selected final-settlement record. This is not proof of nonpayment.`, nextAction: "Check the full settlement document and request clarification or select the relevant reviewed field." };
  const actual = money(input.actual!.value); if (!actual || actual.currency !== expected.currency) return clarify("The selected amounts have unclear or different currencies/precision. No currency conversion was performed.");
  if (actual.minor !== expected.minor) return clarify(`The selected reviewed amounts differ (${input.expected.value} and ${input.actual!.value}). This is a record discrepancy, not a payment or entitlement conclusion.`);
  return { state: "consistent", message: "The selected reviewed amounts and worker-identified periods match. This does not verify payment or entitlement.", nextAction: "Retain both records and clarify any questions about settlement coverage." };
}
export function matchPension(input: { applicable: boolean; employer: string; targetPeriod: string; run?: Run; runSelected: boolean; expected?: ReviewedField; expectedSelected: boolean; expectedPeriod?: string }): Decision {
  if (!input.applicable) return clarify("Pension participation is no longer recorded as Yes for this exit. Clarify participation before verifying.");
  if (!input.runSelected) return { state: "waiting", message: "Waiting for a reviewed pension statement covering the target contribution period.", nextAction: "Obtain an updated statement, review its fields, and set a follow-up date." };
  if (!input.run || (input.expectedSelected && !input.expected)) return clarify("The selected statement or expected contribution is no longer available as reviewed evidence.");
  if (input.run.incomplete) return clarify("Some contribution fields are still unreviewed or rejected. Resolve the entries before matching.");
  const fields = new Map(input.run.fields.map(field => [field.key, field.value]));
  const start = fields.get("statement_start"); const end = fields.get("statement_end");
  if (!month.safeParse(start).success || !month.safeParse(end).success || start! > end! || input.targetPeriod < start! || input.targetPeriod > end!) return clarify("Reviewed statement coverage is missing, ambiguous, or does not cover the target contribution period. Use YYYY-MM coverage months.");
  if (fields.get("entries_complete")?.trim().toLowerCase() !== "yes") return clarify("Confirm that all statement contribution entries are represented. An incomplete extract cannot establish whether a contribution is absent.");
  if (input.expectedSelected && input.expectedPeriod !== input.targetPeriod) return clarify("The reviewed payslip period is missing or differs from the target contribution month. Correct its pay period to YYYY-MM or match without an expected deduction.");
  const expected = input.expected ? money(input.expected.value) : null;
  if (input.expected && !expected) return clarify("The reviewed expected employee contribution cannot be interpreted as one currency amount.");
  let ambiguous = false; const matches: { employee: ReturnType<typeof money>; employer: ReturnType<typeof money> }[] = [];
  for (const index of [1,2,3]) {
    const get = (key: string) => fields.get(`contribution_${index}_${key}`);
    const values = [get("employer"), get("period"), get("date"), get("employee_amount"), get("employer_amount")];
    if (values.every(value => value === undefined)) continue;
    const [employer, period, date, employeeAmount, employerAmount] = values;
    if (!employer || !month.safeParse(period).success || !calendarDate.safeParse(date).success || !employeeAmount || !employerAmount) { ambiguous = true; continue; }
    const employee = money(employeeAmount); const company = money(employerAmount);
    if (!employee || !company || employee.currency !== company.currency) { ambiguous = true; continue; }
    // Contribution period is distinct from posting date; late postings are allowed.
    if (employer.trim().replace(/\s+/g, " ").toLowerCase() === input.employer.trim().replace(/\s+/g, " ").toLowerCase() && period === input.targetPeriod) matches.push({ employee, employer: company });
  }
  if (ambiguous || matches.length > 1) return clarify("Statement entries are incomplete or multiple entries could match. Review them individually; no rows were automatically summed or selected.");
  if (!matches.length) return { state: "contribution_not_detected", message: "No entry matching this employer and contribution period was identified in the reviewed statement entries. This does not establish that contributions were not paid.", nextAction: "Ask the provider/employer for clarification or an updated statement and set a follow-up date." };
  const found = matches[0]!;
  if (found.employee!.minor === 0n && found.employer!.minor === 0n) return clarify("The matching entry contains zero contributions. Confirm its meaning with the provider.");
  if (expected && (expected.currency !== found.employee!.currency || expected.minor !== found.employee!.minor)) return clarify("The reviewed payslip employee deduction and statement employee contribution differ. Employer contributions were not compared to employee deductions.");
  return { state: "contribution_detected", message: "One reviewed entry matches the employer and contribution period. Confirm it against the original statement; this is not provider verification.", nextAction: "Review the source statement, then explicitly confirm this match." };
}
