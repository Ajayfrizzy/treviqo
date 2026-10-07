import { z } from "zod";
import {
  confidenceSchema,
  fieldLabels,
  supportedTypes,
  type ExtractionType,
} from "./shared";
export const PROMPT_VERSION = "evidence-v3";
export const SCHEMA_VERSION = "fields-v3";
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
    confidence: confidenceSchema,
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
export function parseClassification(raw: string, source: string) {
  const value = classificationSchema.parse(JSON.parse(raw));
  if (
    value.type !== "other" &&
    (!value.evidence ||
      !normalizeEvidence(source).includes(normalizeEvidence(value.evidence)))
  )
    throw new Error("Ungrounded classification");
  return value;
}
export function parseFields(raw: string, type: ExtractionType, source: string) {
  const decoded = JSON.parse(raw);
  const proposals =
    decoded && typeof decoded === "object" && Object.hasOwn(decoded, "fields")
      ? proposalsSchema(type).parse(decoded).fields
      : null;
  const input = proposals
    ? Object.fromEntries(
        Object.keys(fieldLabels[type]).map((key) => {
          const field = proposals.find((field) => field.key === key);
          return [
            key,
            field
              ? {
                  value: field.value,
                  evidence: field.evidence,
                  confidence: "needs_review",
                }
              : { value: null, evidence: null, confidence: "needs_review" },
          ];
        }),
      )
    : decoded;
  return Object.entries(fieldsSchema(type).parse(input)).map(
    ([key, input]) => ({
      key,
      ...(key === "entries_complete"
        ? { value: null, evidence: null, confidence: "needs_review" as const }
        : groundedCell(input, source)),
    }),
  );
}
