import type { BenefitCategory, Portability } from "./shared";
export const PASSPORT_RULES_VERSION = "passport-v1";
export const benefitFieldKeys: Record<string, BenefitCategory> = {
  pension_reference: "pension",
  provider: "pension",
  hmo_reference: "hmo",
  group_life_reference: "group_life",
};
// Passport never serializes source excerpts, filenames, financial values or identifier fields.
// Extra protection for identifiers entered into employer/role/provider names; no reveal control.
export function maskSummary(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[hidden]")
    .replace(
      /\b(RSA|PIN|account|policy|member|identifier|ID)\s*(?:number|no\.?)?\s*[:#=]\s*[A-Z0-9_-]+/gi,
      "$1 [hidden]",
    )
    .replace(
      /\b(RSA|PIN|account|policy|member|identifier|ID)\s*(?:number|no\.?)?\s*[:#=-]?\s*[A-Z0-9][A-Z0-9 -]*\d[A-Z0-9 -]*/gi,
      "$1 [hidden]",
    )
    .replace(/\b\d(?:[ -]?\d){5,}\b/g, "[hidden]")
    .replace(
      /\b(?=[A-Z0-9_-]{6,}\b)(?=[A-Z0-9_-]*\d)[A-Z0-9_-]+\b/gi,
      "[hidden]",
    )
    .slice(0, 160);
}
export function classifyBenefit(input: {
  classification: Portability;
  saved: boolean;
  contextCurrent: boolean;
  documentSelected: boolean;
  documentCurrent: boolean;
  fieldSelected: boolean;
  fieldCurrent: boolean;
}) {
  const stale =
    input.saved &&
    (!input.contextCurrent ||
      (input.documentSelected && !input.documentCurrent) ||
      (input.fieldSelected && !input.fieldCurrent));
  if (stale)
    return {
      classification: "unknown" as const,
      stale: true,
      message:
        "Your saved assessment needs a new review because employment, exit details or selected evidence changed. Review current sources and save again.",
    };
  if (!input.saved || input.classification === "unknown")
    return {
      classification: "unknown" as const,
      stale: false,
      message:
        "Portability is unresolved. Check the benefit terms or ask the provider/employer before making an assessment.",
    };
  if (!input.documentSelected || !input.documentCurrent)
    return {
      classification: "unknown" as const,
      stale: true,
      message:
        "Supporting evidence is unavailable. Review current sources before classifying.",
    };
  return {
    classification: input.classification,
    stale: false,
    message:
      input.classification === "portable"
        ? "You assessed this benefit as continuing independently of this employer based on the selected evidence. This does not establish active coverage or transfer completion."
        : "You assessed this benefit as linked to this employer based on the selected evidence. Confirm end dates and any continuation options with the provider/employer.",
  };
}
export function providerSummary(values: string[]): {
  provider: string | null;
  basis: string;
} {
  const unique = new Map(
    values.map((value) => [
      value.trim().replace(/\s+/g, " ").toLowerCase(),
      value.trim(),
    ]),
  );
  if (!unique.size)
    return {
      provider: null,
      basis: "Unknown — no current confirmed/corrected provider field.",
    };
  if (unique.size > 1)
    return {
      provider: null,
      basis:
        "Needs clarification — reviewed provider fields disagree. Review the statement sources.",
    };
  return {
    provider: maskSummary([...unique.values()][0]!),
    basis:
      "Confirmed/corrected document field — reviewed by you, not verified by a provider.",
  };
}
export function dateWarning(
  start: string,
  end: string | null,
  lastWorkingDate?: string,
): string | null {
  if (!end)
    return "Employment end date is unknown. Update the original employment record when known.";
  if (
    end < start ||
    (lastWorkingDate && (lastWorkingDate < start || lastWorkingDate !== end))
  )
    return "Employment and exit dates need clarification. Review the original records; no end date was inferred.";
  return null;
}
