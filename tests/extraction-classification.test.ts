import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  chooseClassification,
  typeAnchors,
} from "@/modules/extractions/classification";
import { parseFields } from "@/modules/extractions/schema";
import {
  fieldAllowed,
  fieldLabels,
  groupReviewFields,
  supportedTypes,
  type ExtractionRecord,
  type ReviewField,
} from "@/modules/extractions/shared";
import { classificationPrompt } from "@/modules/extractions/prompts";

for (const type of supportedTypes) {
  const fixture = JSON.parse(
    readFileSync(`tests/fixtures/intelligence/${type}.json`, "utf8"),
  );
  it(`${type} fixture selects only its own schema regardless of an unrelated AI category`, () => {
    expect(typeAnchors(fixture.text).map((a) => a.type)).toEqual([type]);
    for (const ai of [...supportedTypes, "other"]) {
      expect(
        chooseClassification(fixture.text, {
          type: ai,
          evidence: fixture.classification.evidence,
          confidence: "high",
        }).type,
      ).toBe(type);
    }
    const fields = parseFields(
      JSON.stringify(fixture.fields),
      type,
      fixture.text,
    );
    expect(fields.every((f) => fieldAllowed(type, f.key))).toBe(true);
    expect(fields.filter((f) => f.value).length).toBeGreaterThan(0);
    const record = {
      documentType: type,
      fields: [
        ...fields.map((f, i) => ({
          ...f,
          id: String(i),
          proposedValue: f.value,
          value: null,
          reviewState: "proposed",
          revisions: [],
        })),
        { key: "injected_cross_schema", proposedValue: "bad" },
      ],
    } as ExtractionRecord;
    const groups = groupReviewFields(record);
    expect(
      [...groups.proposed, ...groups.manual, ...groups.optional].every((f) =>
        Object.hasOwn(fieldLabels[type], f.key),
      ),
    ).toBe(true);
    expect(groups.manual.length).toBeLessThanOrEqual(4);
  });
}
it.each([
  "Employer: Acme Ltd\nEmployee: Ada\nSalary: NGN 100",
  "Please supply your pension statement and payslip.",
  "EMPLOYMENT CONTRACT\nPENSION STATEMENT",
  "The contract mentions resignation, termination, pension, salary and deductions.",
])("does not trust AI or shared words in ambiguous sources", (source) => {
  for (const type of supportedTypes)
    expect(
      chooseClassification(source, {
        type,
        evidence: source,
        confidence: "high",
      }),
    ).toMatchObject({ type: "other", diagnostic: "classification_ambiguous" });
});
it.each([
  [
    "employment_contract",
    "Employment type: permanent\nStart date: 2026-01-01\nNotice period: 30 days\nSalary: NGN 100",
  ],
  [
    "payslip",
    "Payroll period: October\nGross salary: NGN 100\nNet pay: NGN 90\nPAYE: NGN 10",
  ],
  [
    "resignation_letter",
    "I hereby resign from my position. My last working day is 30 September 2026.",
  ],
  [
    "termination_letter",
    "Your employment will be terminated effective 30 September 2026.",
  ],
  [
    "final_settlement",
    "Final salary: NGN 100\nLeave encashment: NGN 10\nSettlement payable: NGN 110",
  ],
  [
    "pension_statement",
    "Pension provider: Fixture\nEmployee contribution | Employer contribution | Posting date | Contribution period",
  ],
])("supports distinctive combined anchors for %s", (type, source) => {
  expect(
    chooseClassification(source, {
      type,
      evidence: source,
      confidence: "medium",
    }).type,
  ).toBe(type);
});
it("keeps payslip pension deductions and final settlement salary in their own schemas", () => {
  expect(
    chooseClassification("PAYSLIP\nPension deduction: NGN 100", {
      type: "pension_statement",
      evidence: "Pension deduction",
      confidence: "high",
    }).type,
  ).toBe("payslip");
  expect(
    chooseClassification(
      "FINAL SETTLEMENT\nGross pay: NGN 100\nNet pay: NGN 90\nPay period: May\nTax: NGN 10",
      { type: "payslip", evidence: "Gross pay", confidence: "high" },
    ).type,
  ).toBe("final_settlement");
});
it("hides all proposal groups while a category needs confirmation", () => {
  expect(
    groupReviewFields({
      needsTypeConfirmation: true,
      documentType: "payslip",
      fields: [{ key: "gross_pay", proposedValue: "100" }],
    } as ExtractionRecord),
  ).toEqual({ proposed: [], manual: [], optional: [] });
});
it("separates proposed, useful empty and optional fields without losing manual fallback", () => {
  const fields = Object.keys(fieldLabels.resignation_letter).map((key) => ({
    key,
    value: null,
    proposedValue: key === "letter_date" ? "1 September 2026" : null,
    reviewState: "proposed",
  })) as ReviewField[];
  const groups = groupReviewFields({
    documentType: "resignation_letter",
    fields,
  } as ExtractionRecord);
  expect(groups.proposed.map((f) => f.key)).toEqual(["letter_date"]);
  expect(groups.manual.map((f) => f.key)).toEqual([
    "proposed_last_day",
    "notice_period",
  ]);
  expect(groups.optional.map((f) => f.key)).toEqual(["notice_date", "reason"]);
});
it("classification prompt states purpose and exit initiator without examples", () => {
  const prompt = classificationPrompt("private").system;
  expect(prompt).toContain("document purpose");
  expect(prompt).toContain("employee-initiated resignation");
  expect(prompt).toContain("employer-initiated termination");
  expect(prompt).toContain("No explanation");
  expect(prompt).not.toContain("private");
});
it("does not decide between conflicting exit initiators", () => {
  expect(
    chooseClassification(
      "TERMINATION LETTER\nI hereby resign from my position. My last working day is 30 September 2026.",
      {
        type: "termination_letter",
        evidence: "TERMINATION LETTER",
        confidence: "high",
      },
    ).type,
  ).toBe("other");
});
it("enforces the allowlist matrix for every type and every known field key", () => {
  const keys = new Set(
    Object.values(fieldLabels).flatMap((labels) => Object.keys(labels)),
  );
  for (const type of supportedTypes)
    for (const key of keys) {
      expect(fieldAllowed(type, key)).toBe(
        Object.hasOwn(fieldLabels[type], key),
      );
    }
  expect(fieldAllowed("other", "salary")).toBe(false);
  expect(fieldAllowed("constructor", "salary")).toBe(false);
});
