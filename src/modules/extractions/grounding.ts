// Comparison only: never rewrite the proposed value or its evidence.
const space = (text: string) => text.replace(/\s+/g, " ").trim();
const textForm = (text: string) =>
  space(text)
    .toLowerCase()
    .replace(/\b(ltd|inc|corp)\.(?=\s|$)/g, "$1");
const moneyKeys = new Set([
  "salary",
  "final_salary",
  "leave",
  "reimbursement",
  "bonus",
  "pension_deduction",
  "loan_deduction",
  "other_deduction",
  "total",
  "gross_pay",
  "net_pay",
  "basic_salary",
  "tax",
  "other_deductions",
  "reimbursements",
  "allowances",
]);
const dateKeys = new Set([
  "start_date",
  "letter_date",
  "notice_date",
  "proposed_last_day",
  "effective_date",
]);
const isMoney = (key: string) =>
  moneyKeys.has(key) ||
  /^contribution_[1-3]_(employee_amount|employer_amount)$/.test(key);
const isDate = (key: string) =>
  dateKeys.has(key) || /^contribution_[1-3]_date$/.test(key);
// No currency conversion/symbol inference; preserve the literal code or symbol.
const moneyPattern =
  /(?<![\p{L}\p{N}.,+\-])(?:(?:NGN|USD|EUR|GBP|GHS|KES|ZAR|CAD|AUD|CHF|JPY|XOF|XAF)\s*|[₦$€£]\s*)?[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(?![\p{L}\p{N}]|[.,]\d)/giu;
function moneyForm(value: string) {
  const tokens = [...value.matchAll(moneyPattern)];
  if (tokens.length !== 1 || tokens[0]![0] !== value) return null;
  return value.toUpperCase().replace(/\s|,/g, "").replace(/\.00$/, "");
}
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const monthPattern = months.join("|");
const datePattern = new RegExp(
  `(?<![\\p{L}\\p{N}/-])(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2} (?:${monthPattern}),? \\d{4}|(?:${monthPattern}) \\d{1,2},? \\d{4})(?![\\p{L}\\p{N}/-])`,
  "giu",
);
function dateForm(value: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parts = value.toLowerCase().replace(/,/g, "").split(" ");
  const year = Number(iso?.[1] ?? parts[2]);
  const month = iso
    ? Number(iso[2])
    : months.indexOf(parts[0]!) >= 0
      ? months.indexOf(parts[0]!) + 1
      : months.indexOf(parts[1]!) + 1;
  const day = Number(
    iso?.[3] ?? (months.includes(parts[0]!) ? parts[1] : parts[0]),
  );
  if (year < 1000 || year > 9999 || month < 1 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${year}-${month}-${day}`
    : null;
}
function contains(value: string, evidence: string) {
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "u",
  ).test(evidence);
}
export function valueGrounded(key: string, proposed: string, excerpt: string) {
  const value = space(proposed),
    evidence = space(excerpt);
  if (isMoney(key)) {
    const canonical = moneyForm(value);
    if (canonical !== null)
      return [...evidence.matchAll(moneyPattern)].some(
        ([token]) => moneyForm(token) === canonical,
      );
    // Clauses or unsupported formats still require an exact, bounded excerpt.
    return contains(value, evidence);
  }
  if (isDate(key)) {
    const full = [...value.matchAll(datePattern)];
    if (full.length === 1 && full[0]![0] === value) {
      const canonical = dateForm(value);
      return (
        canonical !== null &&
        [...evidence.matchAll(datePattern)].some(
          ([token]) => dateForm(token) === canonical,
        )
      );
    }
    // Ambiguous numeric dates are never interpreted or reformatted.
    return contains(value, evidence);
  }
  return contains(textForm(value), textForm(evidence));
}
