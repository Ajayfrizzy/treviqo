import { recoverContractFields } from "./contract-recovery";
import { parseFields } from "./schema";
import type { Proposal } from "./persistence";
import type { ExtractionType } from "./shared";

// Only anchored source labels and explicitly shaped rows. No arithmetic, fuzzy
// matching, inferred coverage, or inferred payment/contribution confirmation.
const common = {
  employer: "employer",
  employee: "employee",
  "employee name": "employee",
};
const labels: Partial<Record<ExtractionType, Record<string, string>>> = {
  payslip: {
    ...common,
    "pay period": "pay_period",
    "payment date": "payment_date",
  },
  final_settlement: {
    "final pay period": "pay_period",
    "pay period": "pay_period",
    "settlement status": "settlement_status",
  },
  benefit_document: {
    ...common,
    "pension administrator": "pension_provider",
    "pension provider": "pension_provider",
    "health plan provider": "health_provider",
    "group life provider": "group_life_provider",
    "pension portability status": "pension_wording",
  },
  resignation_letter: {
    "letter date": "letter_date",
    "proposed last working day": "proposed_last_day",
    "notice period": "notice_period",
  },
  termination_letter: {
    "letter date": "letter_date",
    "employment end date": "effective_date",
    reason: "reason",
  },
  exit_letter: {
    ...common,
    "letter date": "letter_date",
    "last working date": "last_working_day",
    "exit type": "exit_type",
  },
  pension_statement: { "pension provider": "provider" },
};
const amounts: Partial<Record<ExtractionType, [RegExp, string][]>> = {
  payslip: [
    [/^gross (?:monthly salary|pay)$/i, "gross_pay"],
    [/^net (?:salary paid|pay)$/i, "net_pay"],
    [/^PAYE tax deduction$/i, "tax"],
    [/^employee pension deduction$/i, "pension_deduction"],
    [/^other deductions(?: - staff cooperative levy)?$/i, "other_deductions"],
    [
      /^employer pension contribution \(separate from net pay\)$/i,
      "employer_pension_contribution",
    ],
  ],
  final_settlement: [
    [/^final month gross salary$/i, "final_gross_salary"],
    [/^final month net salary$/i, "final_net_salary"],
    [/^final salary$/i, "final_salary"],
    [/^PAYE deduction$/i, "tax_deduction"],
    [/^employee pension deduction$/i, "pension_deduction"],
    [/^other payroll deduction$/i, "other_deduction"],
    [/^unused leave payment(?: - \d+ approved days)?$/i, "leave"],
    [/^approved expense reimbursement$/i, "reimbursement"],
    [/^total recorded settlement payable$/i, "total"],
  ],
};
const money = "(?:NGN|₦)\\s*-?\\d[\\d,]*(?:\\.\\d{2})?";
export function recoverSourceFields(
  source: string,
  type: ExtractionType,
): Proposal[] {
  if (type === "employment_contract") return recoverContractFields(source);
  if (source.length > 18000) return [];
  const lines = source.split(/\r?\n/).map((line) => line.trim());
  const candidates = new Map<string, Proposal[]>();
  const add = (key: string, value: string, evidence: string) => {
    if (!value.trim() || value.length > 1000 || evidence.length > 1600) return;
    const entries = candidates.get(key) ?? [];
    entries.push({
      key,
      value: value.trim(),
      evidence,
      confidence: "needs_review",
    });
    candidates.set(key, entries);
  };
  for (const line of lines) {
    const labelled = /^([A-Za-z ]{2,60}):\s*(.+)$/.exec(line);
    if (labelled && !labelled[2]!.includes(":")) {
      const key = labels[type]?.[labelled[1]!.toLowerCase()];
      if (key) add(key, labelled[2]!, line);
    }
    const row = new RegExp("^(.*?)[:\\s]+(" + money + ")$").exec(line);
    if (row) {
      const mapping = amounts[type]?.find(([label]) =>
        label.test(row[1]!.trim()),
      );
      if (mapping) add(mapping[1], row[2]!, line);
    }
  }
  // Preserve complete shared benefit conditions across PDF line wrapping.
  if (type === "benefit_document") {
    for (let i = 0; i < lines.length; i++) {
      if (!/^Benefit coverage at separation:/i.test(lines[i]!)) continue;
      let excerpt = lines[i]!;
      for (
        let next = i + 1;
        !/[.!?]$/.test(excerpt) && next < Math.min(i + 4, lines.length);
        next++
      ) {
        if (/^[^:]{1,60}:/.test(lines[next]!)) break;
        excerpt += "\n" + lines[next];
      }
      if (!/[.!?]$/.test(excerpt)) continue;
      const value = excerpt.slice(excerpt.indexOf(":") + 1).trim();
      if (/\b(?:medical|health)\b/i.test(value))
        add("health_plan_wording", value, excerpt);
      if (/\bgroup life\b/i.test(value))
        add("group_life_wording", value, excerpt);
    }
  }
  if (type === "resignation_letter") {
    // Exact stated intent only; no notice-duration calculation.
    const expression =
      /\bmy intended last\s+working day is (\d{1,2} [A-Za-z]+ \d{4})\./gi;
    for (const match of source.matchAll(expression))
      add("proposed_last_day", match[1]!, match[0]);
  }
  if (type === "pension_statement") {
    for (const line of lines) {
      const coverage =
        /^Statement period:\s*(\d{4}-\d{2}) to (\d{4}-\d{2})$/i.exec(line);
      if (coverage) {
        add("statement_start", coverage[1]!, line);
        add("statement_end", coverage[2]!, line);
      }
    }
    const header =
      "Contribution period Employee contribution Employer contribution Posting date Status";
    const headers = lines.flatMap((line, index) =>
      line.replace(/\s+/g, " ") === header ? [index] : [],
    );
    if (headers.length === 1) {
      const rows: RegExpExecArray[] = [];
      let invalid = false;
      const rowPattern = new RegExp(
        "^(\\d{4}-\\d{2})\\s+(" +
          money +
          ")\\s+(" +
          money +
          ")\\s+(\\d{1,2} [A-Za-z]+ \\d{4})\\s+Posted$",
      );
      for (const line of lines.slice(headers[0]! + 1)) {
        if (!line) continue;
        if (!/^\d{4}-\d{2}\b/.test(line)) break;
        const row = rowPattern.exec(line);
        if (!row) {
          invalid = true;
          break;
        }
        rows.push(row);
      }
      // Never guess which partial/repeated row maps to an entry index.
      if (
        !invalid &&
        rows.length &&
        new Set(rows.map((row) => row[1])).size === rows.length
      ) {
        for (const [index, row] of rows.slice(0, 3).entries()) {
          for (const [suffix, value] of [
            ["period", row[1]],
            ["employee_amount", row[2]],
            ["employer_amount", row[3]],
            ["date", row[4]],
          ] as const)
            add(`contribution_${index + 1}_${suffix}`, value!, row[0]);
        }
      }
    }
  }
  const fields = [...candidates.values()]
    .filter((entries) => entries.length === 1)
    .flat();
  if (!fields.length) return [];
  try {
    return parseFields(JSON.stringify({ fields }), type, source).filter(
      (field) => field.value !== null,
    );
  } catch {
    return [];
  }
}
