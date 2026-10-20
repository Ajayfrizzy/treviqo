import { expect, it } from "vitest";
import { deriveEvidenceFromSource } from "@/modules/extractions/grounding";
import {
  ExtractionParseError,
  parseFields,
} from "@/modules/extractions/schema";
import { type ExtractionType } from "@/modules/extractions/shared";
const parse = (
  fields: unknown[],
  source: string,
  type: ExtractionType = "resignation_letter",
) => parseFields(JSON.stringify({ fields }), type, source);
const resignation =
  "1 September 2026\nMy intended last working day is 30 September 2026\nin line with my notice requirement";
const pension =
  "Provider: Northbridge Systems Nigeria Ltd.\nAugust 2026 | 1 September 2026 | Acme Ltd | NGN 36,000.00 | NGN 45,000.00\nSeptember 2026 | 1 October 2026 | Acme Ltd | NGN 36,000.00 | NGN 45,000.00";
it("recovers unique resignation dates verbatim without inferring notice duration", () => {
  const result = parse(
    [
      { key: "letter_date", value: "01 September 2026" },
      { key: "proposed_last_day", value: "30 September 2026", evidence: "  " },
      { key: "notice_period", value: "30 days" },
    ],
    resignation,
  );
  expect(result.find((f) => f.key === "letter_date")).toMatchObject({
    value: "01 September 2026",
    evidence: "1 September 2026",
    confidence: "needs_review",
  });
  expect(result.find((f) => f.key === "proposed_last_day")?.evidence).toBe(
    resignation.split("\n")[1],
  );
  expect(result.find((f) => f.key === "notice_period")?.value).toBeNull();
  expect(result.partial).toBe(true);
  expect(result.counts).toMatchObject({
    evidence_recovered: 2,
    evidence_not_found: 1,
  });
});
it.each(["NGN 36,000.00", "NGN 45,000.00"])(
  "rejects repeated pension amount alone: %s",
  (value) => {
    expect(() =>
      parse(
        [{ key: "contribution_1_employee_amount", value }],
        pension,
        "pension_statement",
      ),
    ).toThrow(ExtractionParseError);
  },
);
it("uses explicit period and posting date to recover only the matching pension row", () => {
  const result = parse(
    [
      { key: "contribution_1_employee_amount", value: "NGN36000" },
      { key: "contribution_1_period", value: "August 2026" },
      { key: "contribution_1_date", value: "01 September 2026" },
    ],
    pension,
    "pension_statement",
  );
  expect(
    result.find((f) => f.key === "contribution_1_employee_amount"),
  ).toMatchObject({ value: "NGN36000", evidence: pension.split("\n")[1] });
});
it.each([
  [{ key: "contribution_1_employer", value: "Acme Ltd" }],
  [
    { key: "contribution_1_period", value: "August 2026" },
    { key: "contribution_1_date", value: "1 October 2026" },
  ],
  [{ key: "contribution_2_period", value: "August 2026" }],
  [
    { key: "contribution_1_period", value: "August 2026" },
    { key: "contribution_1_period", value: "September 2026" },
  ],
])(
  "does not guess rows with ambiguous, cross-row, or conflicting context: %j",
  (...context) => {
    const result = parse(
      [
        { key: "provider", value: "Northbridge Systems Nigeria Ltd" },
        { key: "contribution_1_employee_amount", value: "NGN 36,000" },
        ...context,
      ],
      pension,
      "pension_statement",
    );
    expect(
      result.find((f) => f.key === "contribution_1_employee_amount")?.value,
    ).toBeNull();
    expect(result.counts.evidence_ambiguous).toBeGreaterThan(0);
  },
);
it("rejects two identical amounts in one row even with explicit context", () => {
  const result = parse(
    [
      { key: "contribution_1_period", value: "August 2026" },
      { key: "contribution_1_employee_amount", value: "NGN 36,000" },
    ],
    "August 2026 | NGN 36,000.00 | NGN 36,000.00",
    "pension_statement",
  );
  expect(
    result.find((f) => f.key === "contribution_1_employee_amount")?.value,
  ).toBeNull();
});
it.each(["Acme Ltd and Acme Ltd", "Acme Ltd\nAcme Ltd"])(
  "counts occurrences, not just matching lines",
  (source) => {
    expect(deriveEvidenceFromSource("employer", "Acme Ltd", source)).toEqual({
      evidence: null,
      reason: "evidence_ambiguous",
    });
  },
);
it("recovers unique normalized provider text with original source wording", () => {
  const result = parse(
    [{ key: "provider", value: "northbridge  systems nigeria ltd" }],
    pension,
    "pension_statement",
  );
  expect(result.find((f) => f.key === "provider")?.evidence).toBe(
    pension.split("\n")[0],
  );
});
it("preserves supplied evidence and never replaces fabricated evidence", () => {
  const result = parse(
    [
      {
        key: "letter_date",
        value: "1 September 2026",
        evidence: "1 September 2026",
      },
      {
        key: "proposed_last_day",
        value: "30 September 2026",
        evidence: "invented",
      },
    ],
    resignation,
  );
  expect(result.counts.evidence_recovered).toBe(0);
  expect(result.counts.evidence_mismatch).toBe(1);
});
it("rejects unsupported, invented, oversized and conflicting recovered proposals", () => {
  expect(() =>
    parse([{ key: "secret", value: "1 September 2026" }], resignation),
  ).toThrow();
  expect(deriveEvidenceFromSource("employer", "Acme", "Other").reason).toBe(
    "evidence_not_found",
  );
  expect(
    deriveEvidenceFromSource("employer", "Acme", "Acme " + "x".repeat(1600))
      .evidence,
  ).toBeNull();
  expect(() =>
    parse(
      [
        { key: "letter_date", value: "1 September 2026" },
        { key: "letter_date", value: "30 September 2026" },
      ],
      resignation,
    ),
  ).toThrow();
});
it.each([
  ["employment_contract", "salary"],
  ["payslip", "gross_pay"],
  ["final_settlement", "final_salary"],
] as const)("recovers formatting-only values for %s", (type, key) => {
  const result = parse(
    [{ key, value: "NGN 450000" }],
    "Salary: NGN 450,000.00",
    type,
  );
  expect(result.find((f) => f.key === key)).toMatchObject({
    value: "NGN 450000",
    evidence: "Salary: NGN 450,000.00",
    confidence: "needs_review",
  });
});
it("rejects overlapping occurrences of a free-text value", () => {
  expect(
    deriveEvidenceFromSource("employer", "Acme Acme", "Acme Acme Acme").reason,
  ).toBe("evidence_ambiguous");
});
