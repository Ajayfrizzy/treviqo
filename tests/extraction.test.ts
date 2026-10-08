import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  fieldsSchema,
  parseFields,
  parseClassification,
  groundedCell,
} from "@/modules/extractions/schema";
import {
  startSchema,
  reviewSchema,
  supportedTypes,
} from "@/modules/extractions/shared";
import { extractionPrompt } from "@/modules/extractions/prompts";
import { prepareDocument } from "@/server/ai/content";
for (const type of supportedTypes) {
  const fixture = JSON.parse(
    readFileSync(`tests/fixtures/intelligence/${type}.json`, "utf8"),
  );
  it(`extracts grounded ${type} fixture and rejects extra model fields`, () => {
    expect(
      parseClassification(JSON.stringify(fixture.classification), fixture.text)
        .type,
    ).toBe(type);
    const fields = parseFields(
      JSON.stringify(fixture.fields),
      type,
      fixture.text,
    );
    expect(fields.some((field) => field.value !== null)).toBe(true);
    expect(
      fieldsSchema(type).safeParse({
        ...fixture.fields,
        legal_entitlement: "binding",
      }).success,
    ).toBe(false);
    expect(extractionPrompt(fixture.text, type).system).toContain(
      "Do not infer, calculate",
    );
  });
  it(`prepares real ${type} PDF locally`, async () => {
    const text = await prepareDocument(
      readFileSync(`tests/fixtures/intelligence/${type}.pdf`),
      "application/pdf",
    );
    expect(text).toContain(fixture.classification.evidence);
    expect(
      parseFields(JSON.stringify(fixture.fields), type, text).filter(
        (field) => field.value !== null,
      ).length,
    ).toBe(
      Object.values(fixture.fields).filter(
        (field) => (field as { value: unknown }).value !== null,
      ).length,
    );
  });
}
it("drops hallucinations, mismatched values and missing evidence, including high confidence", () => {
  for (const input of [
    { value: "999", evidence: "Salary 100", confidence: "high" as const },
    { value: "100", evidence: "Salary 100", confidence: "high" as const },
    { value: "100", evidence: null, confidence: "low" as const },
  ])
    expect(groundedCell(input, "No salary found")).toEqual({
      value: null,
      evidence: null,
      confidence: "needs_review",
    });
});
it.each([
  '```json\n{"type":"Pay Slip","evidence":"Salary slip"}\n```',
  'Here is the result: {"type":" PAYSLIP ","evidence":"Salary slip"} Done.',
  '{"type":"salary-slip","evidence":"Salary slip"}',
])("recovers harmless classification variations: %s", (raw) => {
  expect(parseClassification(raw, "Salary slip")).toEqual({
    type: "payslip",
    evidence: "Salary slip",
    confidence: "medium",
  });
});
it.each([
  "not JSON",
  "{}",
  '{"type":"payslip"',
  '{"type":"legal_opinion","evidence":"source"}',
  '{"type":"payslip","evidence":"invented"}',
  '{"type":"payslip or pension_statement","evidence":"source"}',
  '{"type":"payslip","evidence":"source","confidence":"low"}',
  '{"type":"payslip","evidence":"source"} {"type":"pension_statement","evidence":"source"}',
])("pauses ambiguous or malformed classification safely: %s", (raw) => {
  expect(parseClassification(raw, "source")).toEqual({
    type: "other",
    evidence: null,
    confidence: "needs_review",
  });
});
it("bounds source/review inputs and rejects ownership injection", () => {
  expect(
    startSchema.safeParse({ mode: "ai", text: "x".repeat(18001) }).success,
  ).toBe(false);
  expect(
    startSchema.safeParse({ mode: "manual", type: "benefit_document" }).success,
  ).toBe(false);
  expect(startSchema.safeParse({ mode: "ai", userId: "other" }).success).toBe(
    false,
  );
  const base = { fieldId: "ba9f1c54-40d9-4878-a3a1-8b35a54185d3", version: 0 };
  expect(
    reviewSchema.safeParse({ ...base, action: "correct", value: " " }).success,
  ).toBe(false);
  expect(
    reviewSchema.safeParse({ ...base, action: "confirm", value: "injected" })
      .success,
  ).toBe(false);
});
it("provides manual fallback for blank PDFs, corrupt PDFs and images", async () => {
  await expect(
    prepareDocument(
      readFileSync("tests/fixtures/document.pdf"),
      "application/pdf",
    ),
  ).rejects.toMatchObject({ code: "unreadable" });
  await expect(
    prepareDocument(Buffer.from("bad"), "application/pdf"),
  ).rejects.toMatchObject({ code: "unreadable" });
  await expect(
    prepareDocument(Buffer.from("image"), "image/png"),
  ).rejects.toMatchObject({ code: "unreadable" });
});

it("never accepts AI completeness assertions for pension absence decisions", () => {
  const fixture = JSON.parse(
    readFileSync("tests/fixtures/intelligence/pension_statement.json", "utf8"),
  );
  fixture.fields.entries_complete = {
    value: "yes",
    evidence: "All entries: yes",
    confidence: "high",
  };
  const fields = parseFields(
    JSON.stringify(fixture.fields),
    "pension_statement",
    fixture.text + "\nAll entries: yes",
  );
  expect(
    fields.find((field) => field.key === "entries_complete"),
  ).toMatchObject({ value: null, confidence: "needs_review" });
});

it("validates every expected realistic payslip field against the synthetic source", () => {
  const fixture = JSON.parse(
    readFileSync("tests/fixtures/intelligence/realistic_payslip.json", "utf8"),
  );
  const fields = parseFields(
    JSON.stringify(fixture.fields),
    "payslip",
    fixture.text,
  );
  expect(fields).toHaveLength(11);
  expect(fields.every((f) => f.value === fixture.fields[f.key].value)).toBe(
    true,
  );
});
it("expands sparse model proposals without weakening evidence, duplicate, or key checks", () => {
  const source = "Employer: Harbour Workshop Ltd";
  const field = {
    key: "employer",
    value: "Harbour Workshop Ltd",
    evidence: source,
  };
  const parse = (fields: unknown[]) =>
    parseFields(JSON.stringify({ fields }), "employment_contract", source);
  const fields = parse([field]);
  expect(fields).toHaveLength(14);
  expect(fields.find((f) => f.key === "employer")).toEqual({
    key: "employer",
    value: field.value,
    evidence: source,
    confidence: "needs_review",
  });
  expect(fields.find((f) => f.key === "salary")).toEqual({
    key: "salary",
    value: null,
    evidence: null,
    confidence: "needs_review",
  });
  for (const invalid of [
    [],
    [{ ...field, evidence: "invented excerpt" }],
    [{ ...field, value: "invented employer" }],
    [field, field],
    [{ ...field, key: "legal_entitlement" }],
    [{ key: "employer", value: field.value }],
  ]) {
    expect(() => parse(invalid)).toThrow();
  }
  expect(parse([{ ...field, confidence: "high" }])[0]?.value).toBe(field.value);
});
it("retains six grounded proposals while discarding two invalid ones", () => {
  const fields = [
    "employer",
    "employee",
    "role",
    "start_date",
    "salary",
    "notice_period",
  ].map((key) => ({ key, value: "Explicit", evidence: "Explicit source" }));
  const result = parseFields(
    JSON.stringify({
      fields: [
        ...fields,
        {
          key: "legal_entitlement",
          value: "Explicit",
          evidence: "Explicit source",
        },
        { key: "probation", value: "Explicit" },
      ],
    }),
    "employment_contract",
    "Explicit source",
  );
  expect(result.filter((f) => f.value)).toHaveLength(6);
  expect(result.partial).toBe(true);
});
it("drops invalid legacy cells, unsupported keys, and all conflicting duplicate proposals", () => {
  const result = parseFields(
    JSON.stringify({
      employer: {
        value: "Acme",
        evidence: "Employer Acme",
        confidence: "high",
      },
      salary: { value: 42 },
      legal_entitlement: {
        value: "Acme",
        evidence: "Employer Acme",
        confidence: "high",
      },
    }),
    "payslip",
    "Employer Acme",
  );
  expect(result.filter((f) => f.value)).toHaveLength(1);
  expect(result.partial).toBe(true);
  const mixed = parseFields(
    JSON.stringify({
      fields: [
        { key: "employer", value: "Acme", evidence: "Employer Acme" },
        { key: "tax", value: "100", evidence: "Tax 100" },
        { key: "tax", value: "200", evidence: "Tax 200" },
        { key: "net_pay", value: "100", evidence: "invented" },
      ],
    }),
    "payslip",
    "Employer Acme Tax 100 Tax 200",
  );
  expect(mixed.filter((f) => f.value)).toHaveLength(1);
  expect(mixed.partial).toBe(true);
});
