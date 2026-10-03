---
name: treviqo-domain-rules
description: Use for Job Exit Checker rules, settlement comparisons, pension verification, benefit portability, checklist states, and reminders.
---

# Treviqo Domain Rules

Read `/docs/domain/DOMAIN_RULES.md`, `/docs/product/PRODUCT.md`, and `/AGENTS.md`.

AI extracts facts. Deterministic rules determine workflow state.

Allowed checklist states:
- complete
- pending
- missing
- needs_clarification
- not_applicable

Every non-complete state should explain why and what the user can do next.

Never turn an evidence mismatch into a legal verdict.

Every material rule needs unit tests for normal, missing, ambiguous, and boundary cases.
