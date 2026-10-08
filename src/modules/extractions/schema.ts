import { z } from "zod";
import {
  confidenceSchema,
  fieldLabels,
  supportedTypes,
  type ExtractionType,
} from "./shared";
export const PROMPT_VERSION = "evidence-v4";
export const SCHEMA_VERSION = "fields-v4";
const cell = z
  .object({
    value: z.string().trim().min(1).max(1000).nullable(),
    evidence: z.string().trim().min(1).max(1600).nullable(),
    confidence: confidenceSchema,
  })
  .strict();
export const classificationSchema = z
  .object({
    type: z.enum([...supportedTypes, "other"]),
    evidence: z.string().trim().min(1).max(1600).nullable(),
  })
  .strict();
export function fieldsSchema(type: ExtractionType) {
  return z
    .object(
      Object.fromEntries(
        Object.keys(fieldLabels[type]).map((key) => [key, cell]),
      ),
    )
    .strict();
}
// Small-model wire schema: only present facts, no repeated null/confidence cells.
// Application fields stay complete and untrusted; unknown/duplicate keys fail closed.
export function proposalsSchema(type: ExtractionType) {
  const keys = Object.keys(fieldLabels[type]);
  return z
    .object({
      fields: z
        .array(
          z
            .object({
              key: z.enum(keys as [string, ...string[]]),
              value: z.string().trim().min(1).max(1000),
              evidence: z.string().trim().min(1).max(1600),
            })
            .strict(),
        )
        .max(keys.length),
    })
    .strict()
    .superRefine(({ fields }, ctx) => {
      if (new Set(fields.map((field) => field.key)).size !== fields.length)
        ctx.addIssue({ code: "custom", message: "Duplicate field keys" });
    });
}
export const normalizeEvidence = (text: string) =>
  text.replace(/\s+/g, " ").trim();
export function groundedCell(input: z.infer<typeof cell>, source: string) {
  const evidence = input.evidence && normalizeEvidence(input.evidence);
  // Unsupported proposals are discarded, never silently promoted to trusted data.
  if (
    !input.value ||
    !evidence ||
    !normalizeEvidence(source).includes(evidence) ||
    !evidence.includes(normalizeEvidence(input.value))
  )
    return { value: null, evidence: null, confidence: "needs_review" as const };
  return { ...input, evidence };
}
// Recover one complete JSON object, including fenced JSON or harmless prose.
// Never repair truncated JSON or choose between multiple candidate objects.
function decodeObject(raw: string): Record<string, unknown> {
  if (raw.length > 65536) throw new Error("Oversized output");
  let start = -1,
    depth = 0,
    quoted = false,
    escaped = false;
  const candidates: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (start < 0) {
      if (c === "{") {
        start = i;
        depth = 1;
      }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      candidates.push(raw.slice(start, i + 1));
      start = -1;
    }
  }
  if (start >= 0 || candidates.length !== 1)
    throw new Error("Ambiguous output");
  return JSON.parse(candidates[0]!);
}
const aliases: Record<string, ExtractionType | "other"> = {
  employment_contract: "employment_contract",
  contract: "employment_contract",
  payslip: "payslip",
  pay_slip: "payslip",
  salary_slip: "payslip",
  resignation_letter: "resignation_letter",
  resignation: "resignation_letter",
  termination_letter: "termination_letter",
  termination: "termination_letter",
  final_settlement: "final_settlement",
  final_settlement_document: "final_settlement",
  final_settlement_statement: "final_settlement",
  pension_statement: "pension_statement",
  other: "other",
};
export function parseClassification(raw: string, source: string) {
  const unknown = {
    type: "other" as const,
    evidence: null,
    confidence: "needs_review" as const,
  };
  try {
    const decoded = decodeObject(raw);
    if (typeof decoded.type !== "string") return unknown;
    const label = decoded.type
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    const type = Object.hasOwn(aliases, label) ? aliases[label] : undefined;
    const evidence = z
      .string()
      .trim()
      .min(1)
      .max(1600)
      .safeParse(decoded.evidence);
    if (
      !type ||
      type === "other" ||
      !evidence.success ||
      !normalizeEvidence(source).includes(normalizeEvidence(evidence.data))
    )
      return unknown;
    // Honor an older model's explicit uncertainty. Confidence is otherwise
    // application-assigned; grounding never makes this a confirmed category.
    if (
      decoded.confidence !== undefined &&
      (typeof decoded.confidence !== "string" ||
        !["high", "medium"].includes(decoded.confidence.trim().toLowerCase()))
    )
      return unknown;
    return {
      type,
      evidence: normalizeEvidence(evidence.data),
      confidence: "medium" as const,
    };
  } catch {
    return unknown;
  }
}
export function parseFields(raw: string, type: ExtractionType, source: string) {
  const decoded = decodeObject(raw);
  const sparse = Object.hasOwn(decoded, "fields");
  if (sparse && !Array.isArray(decoded.fields))
    throw new Error("Invalid fields");
  const entries: unknown[] = sparse
    ? (decoded.fields as unknown[])
    : Object.entries(decoded).map(([key, value]) =>
        value && typeof value === "object" ? { ...value, key } : { key },
      );
  if (entries.length > 100) throw new Error("Too many proposals");
  const allowed = fieldLabels[type];
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (
      entry &&
      typeof entry === "object" &&
      "key" in entry &&
      typeof entry.key === "string"
    )
      counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
  }
  const valid = new Map<string, z.infer<typeof cell>>();
  let partial = false;
  for (const entry of entries) {
    const item = z
      .object({
        key: z.string(),
        value: z.unknown(),
        evidence: z.unknown(),
        confidence: confidenceSchema.optional(),
      })
      .safeParse(entry);
    if (!item.success) {
      partial = true;
      continue;
    }
    const { key, value, evidence, confidence } = item.data;
    if (
      !Object.hasOwn(allowed, key) ||
      counts.get(key) !== 1 ||
      key === "entries_complete"
    ) {
      if (value !== null) partial = true;
      continue;
    }
    const parsed = cell.safeParse({
      value,
      evidence,
      confidence: confidence ?? "needs_review",
    });
    if (!parsed.success) {
      partial = true;
      continue;
    }
    const grounded = groundedCell(parsed.data, source);
    if (grounded.value) valid.set(key, grounded);
    else if (value !== null || evidence !== null) partial = true;
  }
  if (!valid.size) throw new Error("No grounded proposals");
  const fields = Object.keys(allowed).map((key) => ({
    key,
    ...(valid.get(key) ?? {
      value: null,
      evidence: null,
      confidence: "needs_review" as const,
    }),
  }));
  return Object.assign(fields, { partial });
}
