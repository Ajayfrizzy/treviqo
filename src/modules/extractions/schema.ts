import { z } from "zod";
import { confidenceSchema, fieldLabels, supportedTypes, type ExtractionType } from "./shared";
export const PROMPT_VERSION = "evidence-v1";
export const SCHEMA_VERSION = "fields-v1";
const cell = z.object({ value: z.string().trim().min(1).max(1000).nullable(), evidence: z.string().trim().min(1).max(1600).nullable(), confidence: confidenceSchema }).strict();
export const classificationSchema = z.object({ type: z.enum([...supportedTypes, "other"]), evidence: z.string().trim().min(1).max(1600).nullable(), confidence: confidenceSchema }).strict();
export function fieldsSchema(type: ExtractionType) { return z.object(Object.fromEntries(Object.keys(fieldLabels[type]).map(key => [key, cell]))).strict(); }
export const normalizeEvidence = (text: string) => text.replace(/\s+/g, " ").trim();
export function groundedCell(input: z.infer<typeof cell>, source: string) {
  const evidence = input.evidence && normalizeEvidence(input.evidence);
  // Unsupported proposals are discarded, never silently promoted to trusted data.
  if (!input.value || !evidence || !normalizeEvidence(source).includes(evidence) || !evidence.includes(normalizeEvidence(input.value))) return { value: null, evidence: null, confidence: "needs_review" as const };
  return { ...input, evidence };
}
export function parseClassification(raw: string, source: string) {
  const value = classificationSchema.parse(JSON.parse(raw));
  if (value.type !== "other" && (!value.evidence || !normalizeEvidence(source).includes(normalizeEvidence(value.evidence)))) throw new Error("Ungrounded classification");
  return value;
}
export function parseFields(raw: string, type: ExtractionType, source: string) {
  return Object.entries(fieldsSchema(type).parse(JSON.parse(raw))).map(([key, input]) => ({ key, ...groundedCell(input, source) }));
}
