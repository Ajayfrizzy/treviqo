import { expect, it } from "vitest";
import {
  classifyBenefit,
  dateWarning,
  maskSummary,
  providerSummary,
} from "@/modules/passport/rules";
import {
  assessmentSchema,
  benefitCategories,
  passportCommand,
} from "@/modules/passport/shared";
const current = {
  saved: true,
  classification: "portable" as const,
  contextCurrent: true,
  documentSelected: true,
  documentCurrent: true,
  fieldSelected: true,
  fieldCurrent: true,
};
it.each(Object.keys(benefitCategories))(
  "does not infer portability for %s from category or reviewed wording",
  () => {
    expect(classifyBenefit({ ...current, saved: false }).classification).toBe(
      "unknown",
    );
    expect(
      classifyBenefit({ ...current, classification: "unknown" }).classification,
    ).toBe("unknown");
  },
);
it.each(["portable", "employer_linked"] as const)(
  "retains current worker %s assessment without asserting coverage",
  (classification) => {
    expect(classifyBenefit({ ...current, classification })).toMatchObject({
      classification,
      stale: false,
    });
  },
);
it.each([
  { contextCurrent: false },
  { documentCurrent: false },
  { fieldCurrent: false },
  { documentSelected: false },
])("invalidates missing/changed evidence or context %j", (change) => {
  expect(classifyBenefit({ ...current, ...change })).toMatchObject({
    classification: "unknown",
    stale: true,
  });
});
it("permits assessment against an original document without an extracted field", () => {
  expect(
    classifyBenefit({ ...current, fieldSelected: false, fieldCurrent: false })
      .classification,
  ).toBe("portable");
});
it("leaves unknown providers and conflicts unresolved; normalizes whitespace/case only", () => {
  expect(providerSummary([]).provider).toBeNull();
  expect(
    providerSummary(["Harbour Pensions", " harbour   pensions "]).provider,
  ).toBe("harbour   pensions");
  expect(providerSummary(["Harbour", "Harbor"]).provider).toBeNull();
});
it.each([
  "Provider RSA: ABC12345678",
  "Provider PIN 1234567890",
  "Employer 1234-5678-9012",
  "Role ID: ZXCV123456",
  "Provider account 123 456 789",
  "Provider ABC123456",
  "Member: ABCDEFG",
  "person@example.test",
])("masks identifiers server-side: %s", (value) => {
  const masked = maskSummary(value);
  expect(masked).toContain("[hidden]");
  expect(masked).not.toMatch(/123456|1234-5678|123 456/);
});
it("preserves ordinary names, caps summary text, and masks provider output", () => {
  expect(maskSummary("Harbour Workshop Ltd")).toBe("Harbour Workshop Ltd");
  expect(maskSummary("x".repeat(300))).toHaveLength(160);
  expect(providerSummary(["PFA RSA 123456789"]).provider).not.toContain(
    "123456789",
  );
});
it("does not infer end dates or ignore contradictory original dates", () => {
  expect(dateWarning("2024-01-01", null, "2026-10-31")).toContain("unknown");
  expect(dateWarning("2024-01-01", "2026-10-30", "2026-10-31")).toContain(
    "clarification",
  );
  expect(dateWarning("2024-01-01", "2024-01-01", "2024-01-01")).toBeNull();
  expect(dateWarning("2024-01-01", "2026-10-31")).toBeNull();
});
it("requires evidence acknowledgment for classification and rejects injected fields", () => {
  const input = {
    category: "pension",
    classification: "portable",
    version: null,
    contextToken: "a".repeat(64),
    documentId: "doc",
    fieldId: null,
    fieldVersion: null,
    evidenceAcknowledged: true,
  };
  expect(assessmentSchema.safeParse(input).success).toBe(true);
  for (const change of [
    { documentId: null },
    { evidenceAcknowledged: false },
    { userId: "other" },
    { fieldId: "field" },
    { classification: "verified" },
    { version: -1 },
  ])
    expect(assessmentSchema.safeParse({ ...input, ...change }).success).toBe(
      false,
    );
  expect(
    assessmentSchema.safeParse({
      ...input,
      classification: "unknown",
      documentId: null,
      evidenceAcknowledged: false,
    }).success,
  ).toBe(true);
  expect(
    passportCommand.safeParse({
      action: "remove",
      category: "pension",
      version: 0,
      userId: "other",
    }).success,
  ).toBe(false);
});
