import { expect, it } from "vitest";
import layouts from "./fixtures/intelligence/labelled-source-layouts.json";
import { recoverSourceFields } from "@/modules/extractions/source-recovery";
import { typeAnchors } from "@/modules/extractions/classification";
import { extractionPrompt } from "@/modules/extractions/prompts";
import type { ExtractionType } from "@/modules/extractions/shared";

for (const [type, source] of Object.entries(layouts)) {
  it(`grounds ${type} source layout without trusting or rewriting values`, () => {
    expect(typeAnchors(source).map((anchor) => anchor.type)).toEqual([type]);
    const fields = recoverSourceFields(source, type as ExtractionType);
    expect(fields.length).toBeGreaterThan(1);
    for (const field of fields) {
      expect(source.replace(/\s+/g, " ")).toContain(
        field.evidence!.replace(/\s+/g, " "),
      );
      expect(field.evidence).toContain(field.value);
      expect(field.confidence).toBe("needs_review");
    }
  });
}
const values = (type: keyof typeof layouts, source = layouts[type]) =>
  Object.fromEntries(
    recoverSourceFields(source, type).map((f) => [f.key, f.value]),
  );
it("separates payslip gross, net, tax and employee/employer pension", () => {
  expect(values("payslip")).toMatchObject({
    gross_pay: "NGN 245,000.00",
    net_pay: "NGN 197,175.00",
    tax: "NGN 25,725.00",
    pension_deduction: "NGN 19,600.00",
    employer_pension_contribution: "NGN 24,500.00",
    other_deductions: "NGN 2,500.00",
    payment_date: "31 August 2022",
  });
});
it("preserves signed settlement deductions without conflating salary or proving payment", () => {
  expect(values("final_settlement")).toMatchObject({
    final_gross_salary: "NGN 245,000.00",
    final_net_salary: "NGN 197,175.00",
    tax_deduction: "NGN -25,725.00",
    pension_deduction: "NGN -19,600.00",
    other_deduction: "NGN -2,500.00",
    leave: "NGN 44,545.00",
    reimbursement: "NGN 18,500.00",
    total: "NGN 260,220.00",
    settlement_status:
      "Recorded as payable; bank receipt not independently verified",
  });
  expect(values("final_settlement")).not.toHaveProperty("final_salary");
});
it("keeps complete wrapped coverage limitations and does not invent providers", () => {
  const fields = values("benefit_document");
  expect(fields.health_plan_wording).toBe(
    "Group life insurance and outpatient medical cover were employer-linked\nand ended after separation.",
  );
  expect(fields.group_life_wording).toBe(fields.health_plan_wording);
  expect(fields).not.toHaveProperty("health_provider");
  expect(fields).not.toHaveProperty("group_life_provider");
});
it("reads resignation dates without calculating notice duration", () => {
  expect(values("resignation_letter")).toEqual({
    letter_date: "1 August 2022",
    proposed_last_day: "31 August 2022",
  });
});
it("ties repeated pension amounts to source periods and posting dates, never completeness", () => {
  const fields = values("pension_statement");
  for (const [i, month, date] of [
    [1, "2022-06", "7 July 2022"],
    [2, "2022-07", "7 August 2022"],
    [3, "2022-08", "7 September 2022"],
  ]) {
    expect(fields[`contribution_${i}_period`]).toBe(month);
    expect(fields[`contribution_${i}_date`]).toBe(date);
    expect(fields[`contribution_${i}_employee_amount`]).toBe("NGN 19,600.00");
    expect(fields[`contribution_${i}_employer_amount`]).toBe("NGN 24,500.00");
  }
  expect(fields).not.toHaveProperty("entries_complete");
});
it("rejects duplicate labels, unlabelled amounts and unsupported table formats", () => {
  expect(
    values("payslip", layouts.payslip + "\nGross monthly salary NGN 999.00"),
  ).not.toHaveProperty("gross_pay");
  for (const source of [
    layouts.pension_statement.replace("2022-07", "2022-06"),
    layouts.pension_statement.replace(
      "Employer contribution Posting",
      "Total contribution Posting",
    ),
    layouts.pension_statement.replace(
      "7 July 2022 Posted",
      "missing-date Posted",
    ),
  ]) {
    expect(
      Object.keys(values("pension_statement", source)).some((k) =>
        k.startsWith("contribution_"),
      ),
    ).toBe(false);
  }
  expect(
    recoverSourceFields("NGN 19,600.00\nNGN 24,500.00", "pension_statement"),
  ).toEqual([]);
  expect(recoverSourceFields("x".repeat(18001), "payslip")).toEqual([]);
});
it("keeps financial distinctions explicit in a compact prompt", () => {
  expect(extractionPrompt("", "payslip").system).toContain(
    "Keep gross and net salary separate.",
  );
  expect(extractionPrompt("", "final_settlement").system).toContain(
    "Payable does not mean paid.",
  );
});

it("keeps pension coverage months separate from a next-year posting date and does not certify history", () => {
  const source =
    "Pension Contribution Statement\nPension provider: Example Pensions Ltd\nStatement period: 2024-10 to 2024-12\nContribution period Employee contribution Employer contribution Posting date Status\n2024-10 NGN 30,800.00 NGN 38,500.00 7 November 2024 Posted\n2024-11 NGN 30,800.00 NGN 38,500.00 7 December 2024 Posted\n2024-12 NGN 30,800.00 NGN 38,500.00 7 January 2025 Posted";
  const result = values("pension_statement", source);
  expect(result).toMatchObject({
    statement_start: "2024-10",
    statement_end: "2024-12",
    contribution_3_period: "2024-12",
    contribution_3_date: "7 January 2025",
    contribution_3_employee_amount: "NGN 30,800.00",
    contribution_3_employer_amount: "NGN 38,500.00",
  });
  expect(result).not.toHaveProperty("entries_complete");
  const incomplete = values(
    "pension_statement",
    source.replace(/2024-11 NGN[^\n]+\n/, ""),
  );
  expect(incomplete).not.toHaveProperty("entries_complete");
  expect(incomplete.contribution_2_period).toBe("2024-12");
  expect(incomplete).not.toHaveProperty("contribution_3_period");
});
it("does not invent group-life coverage in a medical/provident summary", () => {
  const source =
    "Employment Benefits Summary\nEmployee: Fixture Worker\nEmployer: Example Services Ltd\nBenefit coverage at separation: Employee provident savings plan contributions were recorded; group\nmedical cover was employer-linked.";
  const result = values("benefit_document", source);
  expect(result.employee).toBe("Fixture Worker");
  expect(result.employer).toBe("Example Services Ltd");
  expect(result.health_plan_wording).toContain(
    "medical cover was employer-linked.",
  );
  expect(result).not.toHaveProperty("group_life_wording");
});
