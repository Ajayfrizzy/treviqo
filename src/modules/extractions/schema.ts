import { deriveEvidenceFromSource, valueGrounded } from "./grounding";
import { z } from "zod";
import {
  confidenceSchema,
  fieldLabels,
  supportedTypes,
  type ExtractionType,
} from "./shared";
export const PROMPT_VERSION = "evidence-v12";
export const SCHEMA_VERSION = "fields-v12";
const cell = z
  .object({
    value: z.string().min(1).max(1000).nullable(),
    evidence: z.string().min(1).max(1600).nullable(),
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
export function groundedCell(
  input: z.infer<typeof cell>,
  source: string,
  key = "",
) {
  const evidence = input.evidence && normalizeEvidence(input.evidence);
  // Unsupported proposals are discarded, never silently promoted to trusted data.
  if (
    !input.value ||
    !evidence ||
    !normalizeEvidence(source).includes(evidence) ||
    !valueGrounded(key, input.value, evidence)
  )
    return { value: null, evidence: null, confidence: "needs_review" as const };
  return { ...input, confidence: "needs_review" as const };
}
// Bounded structural salvage only: one complete JSON object or array, possibly
// fenced or wrapped in prose. Never invent delimiters or splice broken objects.
class JsonStructureError extends Error {
  constructor(
    public readonly reason:
      "invalid_json" | "multiple_json_candidates" | "truncated_json",
  ) {
    super("Invalid extraction structure");
  }
}
function decodeValue(raw: string): unknown {
  if (raw.length > 65536) throw new Error("Oversized output");
  let start = -1,
    quoted = false,
    escaped = false;
  const stack: string[] = [];
  const candidates: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (start < 0) {
      if (c === "{" || c === "[") {
        start = i;
        stack.push(c);
      } else if (c === "}" || c === "]") {
        throw new JsonStructureError("invalid_json");
      }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{" || c === "[") {
      stack.push(c);
      if (stack.length > 12) throw new Error("Output nesting limit");
    } else if (c === "}" || c === "]") {
      if (stack.pop() !== (c === "}" ? "{" : "["))
        throw new Error("Invalid JSON boundaries");
      if (!stack.length) {
        candidates.push(raw.slice(start, i + 1));
        start = -1;
      }
    }
  }
  // Never select/merge one payload from several, even if one looks like an example.
  if (candidates.length > 1)
    throw new JsonStructureError("multiple_json_candidates");
  if (start >= 0) throw new JsonStructureError("truncated_json");
  if (candidates.length !== 1) throw new JsonStructureError("invalid_json");
  return JSON.parse(candidates[0]!);
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const normalizeKey = (key: string) =>
  key
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
function normalizeProperties(value: Record<string, unknown>) {
  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (Object.hasOwn(result, normalized))
      throw new Error("Ambiguous properties");
    result[normalized] = item;
  }
  return result;
}
const aliases: Record<string, ExtractionType | "other"> = {
  employment_contract: "employment_contract",
  contract: "employment_contract",
  payslip: "payslip",
  pay_slip: "payslip",
  salary_slip: "payslip",
  resignation_letter: "resignation_letter",
  resignation: "resignation_letter",
  exit_letter: "exit_letter",
  exit_confirmation_letter: "exit_letter",
  termination_letter: "termination_letter",
  termination: "termination_letter",
  final_settlement: "final_settlement",
  final_settlement_document: "final_settlement",
  final_settlement_statement: "final_settlement",
  pension_statement: "pension_statement",
  benefit_document: "benefit_document",
  benefit_summary: "benefit_document",
  employee_benefit_summary: "benefit_document",
  other: "other",
};
export function parseClassification(raw: string, source: string) {
  const unknown = {
    type: "other" as const,
    evidence: null,
    confidence: "needs_review" as const,
  };
  try {
    const value = decodeValue(raw);
    if (!record(value)) return unknown;
    const decoded = normalizeProperties(value);
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
// Only explicit equivalent names are accepted; aliases still pass the type's allowlist.
const fieldAliases: Record<string, string> = {
  employer_name: "employer",
  employee_name: "employee",
  job_title: "role",
  role_title: "role",
};
export class ExtractionParseError extends Error {
  constructor(public readonly counts: Record<string, number>) {
    super("No grounded proposals");
  }
}
export function parseFields(raw: string, type: ExtractionType, source: string) {
  const counts = {
    invalid_json: 0,
    multiple_json_candidates: 0,
    truncated_json: 0,
    invalid_structure: 0,
    unsupported_key: 0,
    missing_evidence: 0,
    evidence_recovered: 0,
    evidence_ambiguous: 0,
    evidence_not_found: 0,
    evidence_mismatch: 0,
    value_mismatch: 0,
    conflicting_duplicate: 0,
  };
  try {
    return parseFieldEntries(raw, type, source, counts);
  } catch (error) {
    if (error instanceof ExtractionParseError) throw error;
    if (!Object.values(counts).some(Boolean)) counts.invalid_structure++;
    throw new ExtractionParseError(counts);
  }
}
function parseFieldEntries(
  raw: string,
  type: ExtractionType,
  source: string,
  counts: ExtractionParseError["counts"],
) {
  let decoded: unknown;
  try {
    decoded = decodeValue(raw);
  } catch (error) {
    const reason =
      error instanceof JsonStructureError ? error.reason : "invalid_json";
    counts[reason]!++;
    throw new ExtractionParseError(counts);
  }
  let entries: unknown[];
  if (Array.isArray(decoded)) entries = decoded;
  else if (record(decoded)) {
    const root = normalizeProperties(decoded);
    if (Object.hasOwn(root, "fields")) {
      if (Array.isArray(root.fields)) entries = root.fields;
      else if (record(root.fields)) entries = [root.fields];
      else throw new Error("Invalid fields");
    } else if (Object.hasOwn(root, "key")) entries = [root];
    else
      entries = Object.entries(root).map(([key, value]) => {
        if (!record(value)) return null;
        try {
          const cell = normalizeProperties(value);
          // The legacy object's enclosing key is authoritative; never override it
          // with a conflicting nested key supplied by the model.
          if (Object.hasOwn(cell, "key")) return null;
          return { ...cell, key };
        } catch {
          return null;
        }
      });
  } else throw new Error("Invalid output");
  if (entries.length > 100) throw new Error("Too many proposals");
  const allowed = fieldLabels[type];
  const valid = new Map<string, z.infer<typeof cell>>();
  const conflicting = new Set<string>();
  let partial = false;
  for (const entry of entries) {
    if (!record(entry)) {
      counts.invalid_structure!++;
      partial = true;
      continue;
    }
    let item: Record<string, unknown>;
    try {
      item = normalizeProperties(entry);
    } catch {
      counts.invalid_structure!++;
      partial = true;
      continue;
    }
    if (typeof item.key !== "string") {
      counts.invalid_structure!++;
      partial = true;
      continue;
    }
    const normalized = normalizeKey(item.key);
    const key = Object.hasOwn(fieldAliases, normalized)
      ? fieldAliases[normalized]!
      : normalized;
    if (!Object.hasOwn(allowed, key) || key === "entries_complete") {
      if (item.value !== null) {
        partial = true;
        counts.unsupported_key!++;
      }
      continue;
    }
    if (
      typeof item.value === "string" &&
      item.value.trim() &&
      item.value.length <= 1000 &&
      (item.evidence == null ||
        (typeof item.evidence === "string" && !item.evidence.trim()))
    ) {
      const prefix = /^(contribution_[1-3])_/.exec(key)?.[1];
      // Use only explicitly proposed sibling context, never inferred context or
      // another row's fields. Conflicting duplicates cannot disambiguate a row.
      const contexts = new Map<string, string>();
      let conflict = false;
      if (prefix)
        for (const candidate of entries) {
          if (!record(candidate)) continue;
          let sibling: Record<string, unknown>;
          try {
            sibling = normalizeProperties(candidate);
          } catch {
            continue;
          }
          if (typeof sibling.key !== "string") continue;
          const siblingKey = normalizeKey(sibling.key);
          if (
            ![
              `${prefix}_period`,
              `${prefix}_date`,
              `${prefix}_employer`,
            ].includes(siblingKey)
          )
            continue;
          if (
            typeof sibling.value !== "string" ||
            !sibling.value.trim() ||
            sibling.value.length > 1000
          )
            continue;
          if (
            contexts.has(siblingKey) &&
            contexts.get(siblingKey) !== sibling.value
          )
            conflict = true;
          contexts.set(siblingKey, sibling.value);
        }
      const recovery = conflict
        ? { evidence: null, reason: "evidence_ambiguous" as const }
        : deriveEvidenceFromSource(
            key,
            item.value,
            source,
            [...contexts].map(([key, value]) => ({ key, value })),
          );
      counts[recovery.reason]!++;
      if (recovery.evidence !== null) item.evidence = recovery.evidence;
    }
    const parsed = cell.safeParse({
      value: item.value,
      evidence: item.evidence,
      confidence: "needs_review",
    });
    if (!parsed.success) {
      if (
        typeof item.evidence !== "string" ||
        !normalizeEvidence(item.evidence)
      )
        counts.missing_evidence!++;
      else counts.invalid_structure!++;
      partial = true;
      continue;
    }
    const grounded = groundedCell(parsed.data, source, key);
    if (!grounded.value) {
      if (item.value !== null || item.evidence !== null) {
        partial = true;
        if (!parsed.data.evidence || !normalizeEvidence(parsed.data.evidence))
          counts.missing_evidence!++;
        else if (
          !normalizeEvidence(source).includes(
            normalizeEvidence(parsed.data.evidence),
          )
        )
          counts.evidence_mismatch!++;
        else counts.value_mismatch!++;
      }
      continue;
    }
    const previous = valid.get(key);
    if (
      previous &&
      normalizeEvidence(previous.value!) !== normalizeEvidence(grounded.value)
    ) {
      counts.conflicting_duplicate!++;
      conflicting.add(key);
      valid.delete(key);
      partial = true;
    } else if (!conflicting.has(key) && !previous) valid.set(key, grounded);
  }
  if (!valid.size) throw new ExtractionParseError(counts);
  // Partial means coverage is incomplete or proposals were omitted, not that
  // the remaining values are trusted. Pension completeness is always manual.
  partial ||=
    valid.size <
    Object.keys(allowed).filter((key) => key !== "entries_complete").length;
  const fields = Object.keys(allowed).map((key) => ({
    key,
    ...(valid.get(key) ?? {
      value: null,
      evidence: null,
      confidence: "needs_review" as const,
    }),
  }));
  return Object.assign(fields, { partial, counts });
}
