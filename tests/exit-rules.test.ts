import { expect, it } from "vitest";
import { buildChecklist, noticeDeadline } from "@/modules/exits/rules";
import { exitSchema, createExitSchema, updateExitSchema, exitTypes, type ExitInput, type ExitEvidence } from "@/modules/exits/shared";
const base = exitSchema.parse({ exitType: "resignation", lastWorkingDate: "2026-10-31" });
const evidence: ExitEvidence = { employmentStart: "2024-01-01", documents: [{ id: "pay", name: "Final pay.pdf", type: "payslip" }, { id: "record", name: "Evidence.pdf", type: "other" }], noticeFields: [{ id: "field", version: 1, value: "30 days", documentId: "contract", name: "Contract.pdf" }] };
function rule(id: string, answers: Partial<ExitInput> = {}, context = evidence) { return buildChecklist({ ...base, ...answers }, context).find(item => item.ruleId === id)!; }
for (const type of Object.keys(exitTypes) as ExitInput["exitType"][]) it(`creates a stable nine-item checklist for ${type} without assuming notice applicability`, () => {
  const result = buildChecklist({ ...base, exitType: type }, evidence);
  expect(result).toHaveLength(9); expect(new Set(result.map(item => item.ruleId)).size).toBe(9);
  expect(result[0]!.state).toBe("needs_clarification");
  for (const item of result) { expect(item.message).not.toBe(""); expect(item.nextAction).not.toBe(""); expect(item.message).not.toMatch(/illegal|employer owes|legally valid/i); }
  expect(buildChecklist({ ...base, exitType: type }, evidence)).toEqual(result);
});
it.each([
  ["2026-10-01", "30 days", "2026-10-31"], ["2026-10-01", "30 calendar days", "2026-10-31"],
  ["2026-10-01", "2 weeks", "2026-10-15"], ["2024-01-31", "1 month", "2024-02-29"], ["2025-01-31", "1 month", "2025-02-28"],
  ["2024-02-28", "1 day", "2024-02-29"], ["2026-12-31", "1 day", "2027-01-01"], ["2026-10-01", "0 days", "2026-10-01"],
  ["2026-10-01", "30 working days", null], ["2026-10-01", "30 days or pay in lieu", null], ["2026-10-01", "one month", null],
  ["2026-10-01", "999 months", null], ["2026-10-01", "105 weeks", null], ["9999-12-31", "1 day", null], ["2026-02-30", "30 days", null],
])("calendar notice calculation %s + %s", (date, period, expected) => { expect(noticeDeadline(date!, period!)).toBe(expected); });
it.each([
  [{ noticeApplicable: "no" }, "not_applicable"], [{}, "needs_clarification"],
  [{ noticeApplicable: "yes" }, "missing"], [{ noticeApplicable: "yes", noticeRequirement: "30 days" }, "missing"],
  [{ noticeApplicable: "yes", noticeDate: "2026-10-01", noticeRequirement: "30 working days" }, "needs_clarification"],
  [{ noticeApplicable: "yes", noticeDate: "2026-10-02", noticeRequirement: "30 days" }, "needs_clarification"],
  [{ noticeApplicable: "yes", noticeDate: "2026-10-01", noticeRequirement: "30 days" }, "complete"],
  [{ noticeApplicable: "yes", noticeDate: "2026-09-30", noticeRequirement: "30 days" }, "complete"],
  [{ noticeApplicable: "yes", noticeDate: "2026-11-01", noticeRequirement: "0 days" }, "needs_clarification"],
  [{ noticeApplicable: "no", lastWorkingDate: "2023-01-01" }, "needs_clarification"],
] as [Partial<ExitInput>, string][]) ("notice state for %j", (input, state) => { expect(rule("notice", input).state).toBe(state); });
it("uses only the selected reviewed version and rejects changed or removed field evidence", () => {
  const input: Partial<ExitInput> = { noticeApplicable: "yes", noticeDate: "2026-10-01", noticeFieldId: "field", noticeFieldVersion: 1 };
  expect(rule("notice", input).state).toBe("complete"); expect(rule("notice", input).evidenceRefs.some(ref => ref.kind === "field")).toBe(true);
  expect(rule("notice", { ...input, noticeFieldVersion: 0 }).state).toBe("needs_clarification");
  expect(rule("notice", input, { ...evidence, noticeFields: [] }).state).toBe("needs_clarification");
});
it.each([
  [{}, "missing"], [{ finalPayDocumentId: "deleted", finalPayPeriod: "October" }, "missing"],
  [{ finalPayDocumentId: "record", finalPayPeriod: "October" }, "needs_clarification"],
  [{ finalPayDocumentId: "pay" }, "needs_clarification"], [{ finalPayDocumentId: "pay", finalPayPeriod: "October 2026" }, "complete"],
] as [Partial<ExitInput>, string][]) ("final salary records %j", (input, state) => { expect(rule("final_salary", input).state).toBe(state); });
for (const [id, key] of [["unused_leave", "leave"], ["benefits", "benefits"]] as const) {
  for (const [value, state] of [["unknown", "needs_clarification"], ["none", "not_applicable"], ["pending", "pending"], ["resolved", "complete"]] as const) it(`${id}: ${value}`, () => { expect(rule(id, { [key]: value }).state).toBe(state); expect(rule(id, { [key]: value }).evidenceRefs[0]!.kind).toBe("answer"); });
}
it.each([
  [{}, "needs_clarification"], [{ reimbursements: "none" }, "not_applicable"], [{ reimbursements: "pending" }, "missing"],
  [{ reimbursements: "pending", reimbursementDocumentId: "deleted" }, "missing"], [{ reimbursements: "pending", reimbursementDocumentId: "record" }, "pending"], [{ reimbursements: "resolved" }, "complete"],
] as [Partial<ExitInput>, string][]) ("reimbursements %j", (input, state) => { expect(rule("reimbursements", input).state).toBe(state); });
it.each([
  [{}, "needs_clarification"], [{ pension: "no" }, "not_applicable"], [{ pension: "yes" }, "missing"], [{ pension: "yes", pensionDetailsSaved: true }, "complete"],
] as [Partial<ExitInput>, string][]) ("pension records %j", (input, state) => { expect(rule("pension", input).state).toBe(state); });
it.each([
  [{}, "needs_clarification"], [{ assets: "none" }, "not_applicable"], [{ assets: "held" }, "pending"], [{ assets: "scheduled" }, "pending"],
  [{ assets: "returned" }, "missing"], [{ assets: "returned", assetDocumentId: "deleted" }, "missing"], [{ assets: "returned", assetDocumentId: "record" }, "complete"],
] as [Partial<ExitInput>, string][]) ("company assets %j", (input, state) => { expect(rule("assets", input).state).toBe(state); });
it("exit documents require current selected evidence and tailor actions to the exit type", () => {
  expect(rule("exit_documents").state).toBe("missing"); expect(rule("exit_documents", { exitDocumentId: "deleted" }).state).toBe("missing");
  expect(rule("exit_documents", { exitDocumentId: "record" }).state).toBe("complete");
  expect(rule("exit_documents", { exitType: "contract_completion" }).nextAction).toContain("contract end-date");
  expect(rule("exit_documents", { exitType: "retirement" }).nextAction).toContain("retirement");
});
it.each([
  [{}, "needs_clarification"], [{ reference: "not_needed" }, "not_applicable"], [{ reference: "not_requested" }, "pending"], [{ reference: "requested" }, "pending"],
  [{ reference: "saved" }, "missing"], [{ reference: "saved", referenceDocumentId: "deleted" }, "missing"], [{ reference: "saved", referenceDocumentId: "record" }, "complete"],
] as [Partial<ExitInput>, string][]) ("reference evidence %j", (input, state) => { expect(rule("reference", input).state).toBe(state); });
it("requires a real last-working date and rejects owner/state injection or mixed notice sources", () => {
  expect(exitSchema.safeParse({ exitType: "resignation" }).success).toBe(false);
  expect(exitSchema.safeParse({ ...base, lastWorkingDate: "2026-02-30" }).success).toBe(false);
  expect(exitSchema.safeParse({ ...base, noticeFieldId: "id", noticeFieldVersion: 1, noticeRequirement: "30 days" }).success).toBe(false);
  expect(exitSchema.safeParse({ ...base, noticeFieldId: "id" }).success).toBe(false);
  expect(createExitSchema.safeParse({ employmentId: "id", answers: base, userId: "other" }).success).toBe(false);
  expect(updateExitSchema.safeParse({ version: 0, answers: { ...base, checklist: [] } }).success).toBe(false);
});
