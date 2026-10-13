import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseFields } from "@/modules/extractions/schema";
import { chooseClassification } from "@/modules/extractions/classification";
import { extractionPrompt } from "@/modules/extractions/prompts";
const sample = JSON.parse(
  readFileSync("tests/fixtures/intelligence/exit_letter.json", "utf8"),
);
it("extracts only stated exit facts without treating references as payments or inventing a letter date", () => {
  const fields = parseFields(
    JSON.stringify(sample.fields),
    "exit_letter",
    sample.text,
  );
  expect(fields.filter((f) => f.value)).toHaveLength(8);
  expect(fields.find((f) => f.key === "letter_date")?.value).toBeNull();
  expect(fields.find((f) => f.key === "exit_type")?.value).toBe("Resignation");
  expect(fields.every((f) => f.confidence === "needs_review")).toBe(true);
  expect(() =>
    parseFields(
      JSON.stringify({
        fields: [
          {
            key: "last_working_day",
            value: "1 October 2026",
            evidence: "Last working day: 30 September 2026",
          },
          { key: "paid", value: "yes", evidence: "yes" },
          {
            key: "employer",
            value: "Invented employer",
            evidence: "Invented employer",
          },
        ],
      }),
      "exit_letter",
      sample.text,
    ),
  ).toThrow();
  expect(extractionPrompt(sample.text, "exit_letter").system).toContain(
    "do not prove payment",
  );
});
it("does not classify a mere exit reference or combined letters as an exit confirmation", () => {
  for (const text of [
    "Please collect your exit confirmation letter.",
    sample.text + "\nTERMINATION LETTER",
  ])
    expect(chooseClassification(text, sample.classification).type).toBe(
      "other",
    );
  expect(
    chooseClassification(
      "TERMINATION LETTER\nEmployment will end on 30 September 2026.",
      sample.classification,
    ).type,
  ).toBe("termination_letter");
});
