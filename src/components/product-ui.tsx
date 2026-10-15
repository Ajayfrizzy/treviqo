import type { ReactNode } from "react";
import { UiIcon } from "./ui-icon";
export type Tone =
  "success" | "review" | "info" | "exit" | "history" | "neutral" | "danger";
export const checklistTone: Record<string, Tone> = {
  complete: "success",
  needs_clarification: "review",
  pending: "info",
  missing: "exit",
  not_applicable: "neutral",
};
export const documentTone: Record<string, Tone> = {
  employment_contract: "success",
  payslip: "info",
  resignation_letter: "exit",
  termination_letter: "exit",
  exit_letter: "exit",
  final_settlement: "review",
  pension_statement: "history",
  benefit_document: "history",
  reimbursement_evidence: "info",
  other: "neutral",
};
export function IconBadge({
  icon,
  tone = "info",
}: {
  icon: string;
  tone?: Tone;
}) {
  return (
    <span className={`icon-badge tone-${tone}`}>
      <UiIcon name={icon} />
    </span>
  );
}
export function StatusChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`status-chip tone-${tone}`}>{children}</span>;
}
export function SectionTitle({
  children,
  icon,
  tone = "info",
}: {
  children: ReactNode;
  icon: string;
  tone?: Tone;
}) {
  return (
    <h2 className="product-section-title">
      <IconBadge icon={icon} tone={tone} />
      {children}
    </h2>
  );
}
export function EmptyState({
  title,
  children,
  icon,
  tone = "neutral",
}: {
  title: string;
  children: ReactNode;
  icon: string;
  tone?: Tone;
}) {
  return (
    <section className={`card empty-state tone-${tone}`}>
      <IconBadge icon={icon} tone={tone} />
      <h2>{title}</h2>
      {children}
    </section>
  );
}
