import { expect, it } from "vitest";
import { documentExitType } from "@/modules/exits/discrepancy";
import { recoverSourceFields } from "@/modules/extractions/source-recovery";
import { typeAnchors } from "@/modules/extractions/classification";
it("recognizes explicit redundancy without interpreting document categories as exit types", () => {
  expect(
    documentExitType(
      "reason",
      "Role redundancy following departmental restructuring",
    ),
  ).toBe("redundancy");
  expect(documentExitType("exit_type", "Contract completion")).toBe(
    "contract_completion",
  );
  for (const value of [
    "not redundancy",
    "possible redundancy",
    "Resignation or redundancy",
    "no redundancy payment",
    "The employer may restructure",
  ])
    expect(documentExitType("reason", value)).toBeUndefined();
  expect(
    documentExitType("document_type", "termination_letter"),
  ).toBeUndefined();
});
it("recovers the explicit redundancy notice dates/reason and the employer-issued document category", () => {
  const source =
    "Notice of Role Redundancy\nLetter date: 20 November 2024\nReason: Role redundancy following departmental restructuring\nEmployment end date: 20 December 2024";
  expect(typeAnchors(source).map((a) => a.type)).toEqual([
    "termination_letter",
  ]);
  const fields = recoverSourceFields(source, "termination_letter");
  expect(fields.find((f) => f.key === "reason")?.value).toBe(
    "Role redundancy following departmental restructuring",
  );
  expect(fields.find((f) => f.key === "effective_date")?.value).toBe(
    "20 December 2024",
  );
});
