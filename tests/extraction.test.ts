import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fieldsSchema, parseFields, parseClassification, groundedCell } from "@/modules/extractions/schema";
import { startSchema, reviewSchema, supportedTypes } from "@/modules/extractions/shared";
import { extractionPrompt } from "@/modules/extractions/prompts";
import { prepareDocument } from "@/server/ai/content";
for (const type of supportedTypes) {
  const fixture = JSON.parse(readFileSync(`tests/fixtures/intelligence/${type}.json`, "utf8"));
  it(`extracts grounded ${type} fixture and rejects extra model fields`, () => {
    expect(parseClassification(JSON.stringify(fixture.classification), fixture.text).type).toBe(type);
    const fields = parseFields(JSON.stringify(fixture.fields), type, fixture.text);
    expect(fields.some(field => field.value !== null)).toBe(true);
    expect(fieldsSchema(type).safeParse({ ...fixture.fields, legal_entitlement: "binding" }).success).toBe(false);
    expect(extractionPrompt(fixture.text, type).system).toContain("Do not infer, calculate");
  });
  it(`prepares real ${type} PDF locally`, async () => {
    const text = await prepareDocument(readFileSync(`tests/fixtures/intelligence/${type}.pdf`), "application/pdf");
    expect(text).toContain(fixture.classification.evidence);
    expect(parseFields(JSON.stringify(fixture.fields), type, text).filter(field => field.value !== null).length).toBe(Object.values(fixture.fields).filter((field) => (field as { value: unknown }).value !== null).length);
  });
}
it("drops hallucinations, mismatched values and missing evidence, including high confidence", () => {
  for (const input of [{ value: "999", evidence: "Salary 100", confidence: "high" as const }, { value: "100", evidence: "Salary 100", confidence: "high" as const }, { value: "100", evidence: null, confidence: "low" as const }]) expect(groundedCell(input, "No salary found")).toEqual({ value: null, evidence: null, confidence: "needs_review" });
});
it("rejects malformed JSON, ungrounded classification, unsupported enums and missing keys", () => {
  expect(() => parseClassification("```json {} ```", "source")).toThrow();
  expect(() => parseClassification(JSON.stringify({ type: "payslip", evidence: "fake", confidence: "high" }), "source")).toThrow();
  expect(() => parseClassification(JSON.stringify({ type: "legal_opinion", evidence: null, confidence: "high" }), "source")).toThrow();
  expect(() => parseFields("{}", "payslip", "source")).toThrow();
});
it("bounds source/review inputs and rejects ownership injection", () => {
  expect(startSchema.safeParse({ mode: "ai", text: "x".repeat(18001) }).success).toBe(false);
  expect(startSchema.safeParse({ mode: "manual", type: "pension_statement" }).success).toBe(false);
  expect(startSchema.safeParse({ mode: "ai", userId: "other" }).success).toBe(false);
  const base = { fieldId: "ba9f1c54-40d9-4878-a3a1-8b35a54185d3", version: 0 };
  expect(reviewSchema.safeParse({ ...base, action: "correct", value: " " }).success).toBe(false);
  expect(reviewSchema.safeParse({ ...base, action: "confirm", value: "injected" }).success).toBe(false);
});
it("provides manual fallback for blank PDFs, corrupt PDFs and images", async () => {
  await expect(prepareDocument(readFileSync("tests/fixtures/document.pdf"), "application/pdf")).rejects.toMatchObject({ code: "unreadable" });
  await expect(prepareDocument(Buffer.from("bad"), "application/pdf")).rejects.toMatchObject({ code: "unreadable" });
  await expect(prepareDocument(Buffer.from("image"), "image/png")).rejects.toMatchObject({ code: "unreadable" });
});
