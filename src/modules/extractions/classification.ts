import { supportedTypes, type ExtractionType } from "./shared";

// Validate purpose, not shared names/amounts. Titles must occupy a heading line;
// prose referring to another document does not establish that document's purpose.
const headings: Record<ExtractionType, RegExp> = {
  employment_contract:
    /^(?:employment contract|contract of employment|employment agreement)$/i,
  payslip: /^(?:payslip|pay slip|salary slip|payroll statement)$/i,
  resignation_letter:
    /^(?:resignation|resignation letter|notice of resignation)$/i,
  termination_letter:
    /^(?:termination|termination letter|notice of termination|termination of employment)$/i,
  final_settlement:
    /^(?:final settlement|final settlement statement|final settlement document)$/i,
  pension_statement:
    /^(?:pension statement|pension contribution statement|pension contributions statement)$/i,
};
export function typeAnchors(source: string) {
  const lines = source.split(/\r\n|\r|\n/);
  const text = source.replace(/\s+/g, " ").toLowerCase();
  const has = (pattern: RegExp) => pattern.test(text);
  const combinations: Record<ExtractionType, boolean> = {
    employment_contract:
      has(/\bemployment type\b/) &&
      has(/\bstart date\b/) &&
      has(/\bnotice period\b/) &&
      has(/\b(?:probation|annual leave|salary)\b/),
    payslip:
      has(/\b(?:payroll|pay) period\b/) &&
      has(/\bgross (?:pay|salary)\b/) &&
      has(/\bnet pay\b/) &&
      has(/\b(?:paye|tax|deductions?)\b/),
    resignation_letter:
      has(
        /\bi (?:hereby |am writing to )?(?:resign|tender my resignation)\b/,
      ) &&
      has(/\b(?:last working day|resign from my position|notice period)\b/),
    termination_letter:
      has(
        /\b(?:we (?:hereby )?terminate your employment|your employment (?:is|will be) terminated)\b/,
      ) && has(/\b(?:effective|notice|employment will end)\b/),
    final_settlement:
      has(/\bfinal salary\b/) &&
      has(/\bleave (?:encashment|settlement)\b/) &&
      has(/\b(?:settlement payable|total settlement)\b/),
    pension_statement:
      has(
        /\b(?:pension provider|pension contributions?|retirement service)\b/,
      ) &&
      has(/\bemployee contributions?\b/) &&
      has(/\bemployer contributions?\b/) &&
      has(/\bposting date\b/) &&
      has(/\bcontribution period\b/),
  };
  const titles = supportedTypes.flatMap((type) => {
    const line = lines.find((line) =>
      headings[type].test(
        line
          .trim()
          .replace(/^(?:subject|re)\s*:\s*/i, "")
          .replace(/\s*[—–-]\s*synthetic test only\.?$/i, ""),
      ),
    );
    return line === undefined ? [] : [{ type, evidence: line }];
  });
  // An explicit title takes precedence over shared financial vocabulary. Two
  // different titles (e.g. combined documents) must be confirmed by the user.
  if (titles.length) {
    // Contradictory exit initiators are not resolved by a heading alone.
    for (const type of ["resignation_letter", "termination_letter"] as const) {
      if (
        combinations[type] &&
        !titles.some((title) => title.type === type) &&
        titles.some(
          (title) =>
            title.type === "resignation_letter" ||
            title.type === "termination_letter",
        )
      )
        return [...titles, { type, evidence: null }];
    }
    return titles;
  }
  return supportedTypes
    .filter((type) => combinations[type])
    .map((type) => ({ type, evidence: null }));
}
export function chooseClassification(
  source: string,
  ai: { type: string; evidence: string | null; confidence: string },
) {
  const anchors = typeAnchors(source);
  if (anchors.length === 1) {
    const anchor = anchors[0]!;
    return {
      type: anchor.type,
      evidence:
        anchor.evidence ?? (ai.type === anchor.type ? ai.evidence : null),
      confidence: "medium" as const,
      diagnostic:
        ai.type !== anchor.type
          ? ("classification_anchor_override" as const)
          : null,
    };
  }
  return {
    type: "other" as const,
    evidence: null,
    confidence: "needs_review" as const,
    diagnostic: "classification_ambiguous" as const,
  };
}
