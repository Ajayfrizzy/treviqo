import { expect, it } from "vitest";
import {
  ExtractionParseError,
  parseFields,
} from "@/modules/extractions/schema";
import { extractionPrompt } from "@/modules/extractions/prompts";
import { supportedTypes } from "@/modules/extractions/shared";
const source = "Employer: Actual Company";
const field = { key: "employer", value: "Actual Company", evidence: source };
const payload = JSON.stringify({ fields: [field] });
it.each([
  payload,
  `\`\`\`json\n${payload}\n\`\`\``,
  `Here are the fields: ${payload} End of response.`,
  JSON.stringify([field]),
  `${payload}\n \t`,
  `${payload} These are the extracted fields.`,
])("salvages exactly one grounded payload: %s", (raw) => {
  const result = parseFields(raw, "employment_contract", source);
  expect(result.filter((f) => f.value)).toEqual([
    { ...field, confidence: "needs_review" },
  ]);
  expect(result.partial).toBe(true);
});
it.each([
  [`${payload}\n${payload}`, "multiple_json_candidates"],
  [
    `{"fields":[{"key":"...","value":"...","evidence":"..."}]}\n${payload}`,
    "multiple_json_candidates",
  ],
  [
    `${payload}\n${JSON.stringify({ fields: [{ ...field, value: "Different" }] })}`,
    "multiple_json_candidates",
  ],
  [payload.slice(0, -1), "truncated_json"],
  ['{"fields":[]]', "invalid_json"],
  [
    '{"fields": [{"key": "employer" "value": "Actual Company"}]}',
    "invalid_json",
  ],
  ['{"fields": "unterminated}', "truncated_json"],
  ["Employer is Actual Company", "invalid_json"],
  [`${payload}}`, "invalid_json"],
  [`${payload}\n{"fields":`, "truncated_json"],
])("rejects unsafe output with aggregate reason: %s", (raw, reason) => {
  try {
    parseFields(raw, "employment_contract", source);
    expect.fail("Must reject ambiguous/invalid structure");
  } catch (error) {
    expect(error).toBeInstanceOf(ExtractionParseError);
    expect(
      Object.entries((error as ExtractionParseError).counts).filter(
        ([, count]) => count,
      ),
    ).toEqual([[reason, 1]]);
    expect(JSON.stringify(error)).not.toContain("Actual Company");
  }
});
it("uses only a compact structural shape without concrete examples", () => {
  for (const type of supportedTypes) {
    const prompt = extractionPrompt(source, type).system;
    expect(prompt).toContain(
      '{"fields":[{"key":"...","value":"...","evidence":"..."}]}',
    );
    expect(prompt).toContain(
      "Return exactly one JSON object and nothing before or after it.",
    );
    expect(prompt).toContain(
      "Evidence is required and must be an exact source excerpt containing the value.",
    );
    expect(prompt).toContain(
      "Copy the value exactly as it appears inside the evidence excerpt.",
    );
    expect(prompt).toContain("No confidence or explanation.");
    expect(prompt).toContain("Allowed keys:");
    expect(prompt).not.toMatch(
      /Acme|NGN 100|October 2026|Sample PFA|Example format/,
    );
  }
});
