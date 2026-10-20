import { expect, it } from "vitest";
import { recoverContractFields } from "@/modules/extractions/contract-recovery";
const source = `Employment Agreement
Employer: Synthetic Services Ltd
Employee name: Fixture Worker
Job title: Customer Success Specialist
Start date: 12 September 2022
Employment type: Full-time, permanent
Gross monthly salary: NGN 385,000.00
Salary payment cycle: Monthly, on or before the last working day
Notice period: 30 calendar days by either party, subject to the employment agreement
Probation period: Three months from the start date
Annual leave entitlement: 20 working days per calendar year, subject to approval
Pension administrator: Example Pensions Ltd`;
it("recovers explicit contract facts with original evidence and review required", () => {
  const fields = recoverContractFields(source);
  expect(fields).toHaveLength(11);
  for (const field of fields) {
    expect(source).toContain(field.evidence);
    expect(field.evidence).toContain(field.value);
    expect(field.confidence).toBe("needs_review");
  }
  expect(fields.find((field) => field.key === "role")?.value).toBe(
    "Customer Success Specialist",
  );
});
it("rejects repeated labels, invented fields and unstated facts", () => {
  const fields = recoverContractFields(
    source + "\nEmployer: Different Ltd\nBank PIN: 1234",
  );
  expect(fields.some((field) => field.key === "employer")).toBe(false);
  expect(fields.some((field) => field.key === "hmo_reference")).toBe(false);
  expect(JSON.stringify(fields)).not.toContain("1234");
});
it("does not infer facts from prose or accept unbounded input", () => {
  expect(
    recoverContractFields(
      "You may work as a manager; your employer could be Example Ltd.",
    ),
  ).toEqual([]);
  expect(recoverContractFields("x".repeat(18001))).toEqual([]);
});

it("recovers the full conditional medical/group-life clause without asserting eligibility", () => {
  const clause =
    "Employer-sponsored medical and group life benefits, where applicable, are linked to the employment\nrelationship and are subject to plan terms.";
  const fields = recoverContractFields(source + "\n" + clause);
  for (const key of ["hmo_reference", "group_life_reference"]) {
    expect(fields.find((f) => f.key === key)).toMatchObject({
      value: clause,
      evidence: clause,
      confidence: "needs_review",
    });
  }
  expect(
    recoverContractFields(source + "\n" + clause + "\n" + clause).some(
      (f) => f.key === "group_life_reference",
    ),
  ).toBe(false);
  expect(
    recoverContractFields(
      source + "\nEmployer-sponsored medical and group life benefits may apply",
    ).some((f) => f.key === "group_life_reference"),
  ).toBe(false);
});
