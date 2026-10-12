import { expect, it } from "vitest";
import {
  parseFields,
  ExtractionParseError,
} from "@/modules/extractions/schema";
const parse = (
  key: string,
  value: string,
  evidence: string,
  source = evidence,
) =>
  parseFields(
    JSON.stringify({ fields: [{ key, value, evidence }] }),
    "employment_contract",
    source,
  );
it.each([
  [
    "employer",
    "Northbridge Systems Nigeria Ltd",
    "Employer: Northbridge Systems Nigeria Ltd",
  ],
  [
    "employer",
    "Northbridge  Systems Nigeria Ltd",
    "Employer: Northbridge Systems Nigeria Ltd",
  ],
  [
    "employer",
    "northbridge systems nigeria ltd",
    "Employer: Northbridge Systems Nigeria Ltd",
  ],
  [
    "employer",
    "Northbridge Systems Nigeria Ltd.",
    "Employer: Northbridge Systems Nigeria Ltd",
  ],
  [
    "employer",
    "Northbridge Systems Nigeria Ltd",
    "Employer: Northbridge Systems Nigeria Ltd.",
  ],
  ["salary", "NGN 450,000", "Salary: NGN 450,000.00"],
  ["salary", "NGN450000.00", "Salary: NGN 450,000"],
  ["start_date", "1 February 2024", "Start: 01 February 2024"],
  ["start_date", "2024-02-01", "Start: February 1, 2024"],
])(
  "accepts bounded %s formatting while preserving original strings",
  (key, value, evidence) => {
    expect(parse(key, value, evidence).find((f) => f.key === key)).toEqual({
      key,
      value,
      evidence,
      confidence: "needs_review",
    });
  },
);
it.each([
  ["salary", "NGN 450,001", "Salary: NGN 450,000.00"],
  ["salary", "NGN 450", "Salary: NGN 450,000.00"],
  ["salary", "USD 450,000", "Salary: NGN 450,000.00"],
  ["salary", "NGN 450,000", "Salary: NGN 450,000.50"],
  ["start_date", "2 February 2024", "Start: 01 February 2024"],
  ["start_date", "2024-02-01", "Start: 01/02/2024"],
  ["start_date", "2024-02-30", "Start: 30 February 2024"],
  [
    "employer",
    "Northbridge Systems Ghana Ltd",
    "Employer: Northbridge Systems Nigeria Ltd",
  ],
  ["role", "Manager", "Role: Management"],
  ["unsupported", "anything", "anything"],
])(
  "rejects unsupported or non-equivalent %s values",
  (key, value, evidence) => {
    expect(() => parse(key, value, evidence)).toThrow(ExtractionParseError);
  },
);
it("requires source evidence verbatim except whitespace, not case or punctuation normalization", () => {
  expect(() =>
    parse("employer", "Acme Ltd", "Employer: Acme Ltd", "EMPLOYER: ACME LTD"),
  ).toThrow();
  expect(() =>
    parse("employer", "Acme Ltd", "Employer: Acme Ltd.", "Employer: Acme Ltd"),
  ).toThrow();
  const evidence = "Employer:\nAcme Ltd";
  expect(
    parse("employer", "Acme Ltd", evidence, "Employer: Acme Ltd")[0]!.evidence,
  ).toBe(evidence);
});
it("returns safe aggregate counters and discards all conflicting duplicates", () => {
  try {
    parseFields(
      JSON.stringify({
        fields: [
          { key: "employer", value: "Acme", evidence: "Acme" },
          { key: "employer", value: "Other", evidence: "Other" },
          { key: "role", value: "CEO", evidence: "invented" },
          { key: "salary", value: "NGN 999", evidence: "NGN 100" },
          { key: "employee", value: "Private name" },
          { key: "secret_key", value: "private data" },
        ],
      }),
      "employment_contract",
      "Acme Other NGN 100",
    );
    expect.fail("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(ExtractionParseError);
    expect((error as ExtractionParseError).counts).toMatchObject({
      conflicting_duplicate: 1,
      evidence_mismatch: 1,
      value_mismatch: 1,
      missing_evidence: 1,
      unsupported_key: 1,
    });
    expect(JSON.stringify(error)).not.toMatch(
      /Private name|secret_key|private data|invented|NGN/,
    );
  }
});
it("retains partial valid proposals while dropping invented values", () => {
  const fields = parseFields(
    JSON.stringify({
      fields: [
        {
          key: "salary",
          value: "NGN 450000",
          evidence: "Salary: NGN 450,000.00",
        },
        {
          key: "employer",
          value: "Invented Ltd",
          evidence: "Employer: Acme Ltd",
        },
      ],
    }),
    "employment_contract",
    "Salary: NGN 450,000.00 Employer: Acme Ltd",
  );
  expect(fields.partial).toBe(true);
  expect(fields.find((f) => f.key === "salary")?.value).toBe("NGN 450000");
  expect(fields.find((f) => f.key === "employer")?.value).toBeNull();
});
it.each(["not JSON", '{"fields":['])(
  "categorizes malformed output without including it: %s",
  (raw) => {
    try {
      parseFields(raw, "employment_contract", "Private source");
      expect.fail("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ExtractionParseError);
      expect((error as ExtractionParseError).counts.invalid_json).toBe(1);
      expect((error as Error).message).toBe("No grounded proposals");
    }
  },
);
