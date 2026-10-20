import { parseFields } from "./schema";
import type { Proposal } from "./persistence";

// Exact labels and a bounded explicit benefits clause. Never infer eligibility.
const labels: Record<string, string> = {
  employer: "employer",
  "employee name": "employee",
  "job title": "role",
  role: "role",
  "start date": "start_date",
  "employment type": "employment_type",
  "gross monthly salary": "salary",
  salary: "salary",
  "salary payment cycle": "salary_frequency",
  "notice period": "notice_period",
  "probation period": "probation",
  "annual leave entitlement": "annual_leave",
  "pension administrator": "pension_reference",
};
export function recoverContractFields(source: string): Proposal[] {
  if (source.length > 18000) return [];
  const candidates = new Map<string, Proposal[]>();
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z ]{2,40}):[ \t]*(\S[^\r\n]*)$/.exec(line);
    if (!match) continue;
    const key = labels[match[1]!.trim().toLowerCase()];
    const value = match[2]!.trim();
    if (
      !key ||
      !value ||
      value.includes(":") ||
      value.length > 500 ||
      line.length > 1000
    )
      continue;
    const entries = candidates.get(key) ?? [];
    entries.push({
      key,
      value,
      evidence: line.trim(),
      confidence: "needs_review",
    });
    candidates.set(key, entries);
  }
  // This explicit shared clause is commonly wrapped by PDF text extraction.
  // Preserve every qualifier: it does not establish eligibility or continuation.
  const clauses = [
    ...source.matchAll(
      /Employer-sponsored medical and group life benefits, where applicable, are linked to the employment\s+relationship and are subject to plan terms\./g,
    ),
  ];
  if (clauses.length === 1) {
    for (const key of ["hmo_reference", "group_life_reference"]) {
      candidates.set(key, [
        {
          key,
          value: clauses[0]![0],
          evidence: clauses[0]![0],
          confidence: "needs_review",
        },
      ]);
    }
  }
  // Duplicate labels are ambiguous even if one looks more plausible.
  const fields = [...candidates.values()]
    .filter((entries) => entries.length === 1)
    .flat();
  if (!fields.length) return [];
  try {
    return parseFields(
      JSON.stringify({ fields }),
      "employment_contract",
      source,
    ).filter((field) => field.value !== null);
  } catch {
    return [];
  }
}
