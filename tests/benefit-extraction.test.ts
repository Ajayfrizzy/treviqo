import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseFields } from "@/modules/extractions/schema";
import { chooseClassification } from "@/modules/extractions/classification";
import {
  extractionReadyMessage,
  groupReviewFields,
  type ExtractionRecord,
} from "@/modules/extractions/shared";
const fixture = JSON.parse(
  readFileSync("tests/fixtures/intelligence/benefit_document.json", "utf8"),
);
it("keeps every benefit condition grounded and never invents providers or dates", () => {
  const fields = parseFields(
    JSON.stringify(fixture.fields),
    "benefit_document",
    fixture.text,
  );
  expect(fields.filter((f) => f.value)).toHaveLength(6);
  expect(fields.find((f) => f.key === "health_plan_wording")?.value).toContain(
    "continuation is not automatic",
  );
  expect(fields.find((f) => f.key === "group_life_wording")?.value).toContain(
    "ceases to be eligible",
  );
  expect(
    fields
      .filter((f) => f.key.endsWith("provider"))
      .every((f) => f.value === null),
  ).toBe(true);
  expect(fields.every((f) => f.confidence === "needs_review")).toBe(true);
  const proposed = [
    {
      key: "health_provider",
      value: "Invented Health",
      evidence: "Health coverage is employer-sponsored.",
    },
    {
      key: "coverage_end_date",
      value: "30 September 2026",
      evidence: "30 September 2026",
    },
    { key: "portability", value: "portable", evidence: "portable" },
    { key: "gross_pay", value: "NGN 100", evidence: "NGN 100" },
  ];
  expect(() =>
    parseFields(
      JSON.stringify({ fields: proposed }),
      "benefit_document",
      fixture.text,
    ),
  ).toThrow();
});
it("preserves partial success and shows only benefit fields", () => {
  const result = parseFields(
    JSON.stringify({
      fields: [
        { key: "health_plan_wording", ...fixture.fields.health_plan_wording },
        { key: "salary", value: "invented", evidence: "invented" },
      ],
    }),
    "benefit_document",
    fixture.text,
  );
  expect(result.partial).toBe(true);
  const record = {
    documentType: "benefit_document",
    fields: result.map((f, i) => ({
      ...f,
      id: String(i),
      proposedValue: f.value,
      value: null,
      reviewState: "proposed",
    })),
  } as ExtractionRecord;
  const groups = groupReviewFields(record);
  expect(groups.proposed.map((f) => f.key)).toEqual(["health_plan_wording"]);
  expect(groups.manual.map((f) => f.key)).toEqual([
    "group_life_wording",
    "pension_wording",
  ]);
});
it("does not classify a contract as a benefit summary just because it mentions benefits", () => {
  expect(
    chooseClassification(
      "EMPLOYMENT CONTRACT\nHealth plan and group life coverage are provided. Pension contributions apply.",
      { type: "benefit_document", evidence: "Health plan", confidence: "high" },
    ).type,
  ).toBe("employment_contract");
});
it("uses accurate status text for paused, manual and extracted results", () => {
  expect(
    extractionReadyMessage({ needsTypeConfirmation: true } as ExtractionRecord),
  ).not.toContain("Details are ready");
  expect(
    extractionReadyMessage({ sourceKind: "manual" } as ExtractionRecord),
  ).toContain("Manual fields are ready");
  expect(
    extractionReadyMessage({ sourceKind: "pdf_text" } as ExtractionRecord),
  ).toContain("Nothing is confirmed automatically");
});
