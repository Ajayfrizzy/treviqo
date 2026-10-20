# Treviqo product overview

Treviqo (treh-VEE-koh) is a worker-owned employment and benefits continuity platform, built for Devcenter Hacktober 2026 × RumptyCloud.

**Live application:** [treviqo.rumptycloud.app](https://treviqo.rumptycloud.app) · [Demo walkthrough](DEMO.md)

## Problem and audience

A worker leaving a job may have contracts, payslips, reimbursement records and pension statements in different places. An employer's system rarely provides a personal history that continues into the next role. Missing records and unanswered questions become harder to follow up after departure.

Treviqo helps the individual preserve evidence and organize those follow-ups. The initial audience is Nigerian salaried workers resigning, facing termination or redundancy, completing a contract, retiring or moving between employers. Employers do not administer their accounts.

## Implemented journey

| Step               | What the user can do                                                                         | Important boundary                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Employment history | Create/edit multiple roles and mark them active, exiting or closed                           | Status is user-entered; creating an exit case does not close the job                              |
| Private evidence   | Upload and retrieve documents within each employment                                         | Evidence from another employment cannot be selected merely because it has the same owner          |
| Document review    | Inspect AI proposals/source excerpts and confirm, correct, reject or enter fields manually   | Confidence is not confirmation; extraction does not overwrite original records                    |
| Job Exit Checker   | Save a case and review nine checks, with explanations and next actions                       | Deterministic consistency checks, not legal decisions                                             |
| Settlement review  | Compare selected reviewed amounts and identified periods                                     | No entitlement calculation, proration, currency conversion or proof of payment                    |
| Pension follow-up  | Match reviewed employer/month/contribution evidence and explicitly confirm supported results | No live PFA connection or guaranteed contribution reconciliation                                  |
| Benefit Passport   | View a timeline across closed employments and assess six benefit categories                  | A worker's evidence-backed assessment does not establish active coverage or completed portability |
| Reminders          | Return to due actions, snooze for seven days or dismiss a current prompt                     | In-app only; timing depends on the worker process                                                 |

The Passport already supports multiple completed employers. It derives current summaries from original employment, document, exit and finance records; it is not an immutable certificate or a duplicate database of employment facts. Changed/rejected/deleted evidence can invalidate previous confirmations and assessments.

Benefit categories are pension/RSA, HMO, employer group life, employer-specific benefits, cooperative benefits, and provident/retirement plans. Each begins Unknown/needs confirmation. Portable and employer-linked assessments require the user's evidence and acknowledgment.

## What judges can observe

Follow [the reproducible demo](DEMO.md) to see two completed jobs and a current role, reviewed evidence, an unresolved exit action, settlement comparison, pension confirmation and a cross-employment Passport. The mobile layout uses cards, step forms, clear unknown/error states and source links. Desktop expands the same workflows.

RumptyCloud provides the hosting/infrastructure integration: Next.js web/API, PostgreSQL, Redis, private S3-compatible documents, background worker and Rumpty AI inference. The [architecture guide](../architecture/ARCHITECTURE.md) explains how these responsibilities fit together. Local fixture tests do not establish live provider accuracy or permissions.

## Boundaries and future work

Treviqo is not payroll, an HRIS, a job board, a law firm, a pension provider, an insurer, a bank or an employer verification service. AI extracts stated facts; rules compare reviewed evidence. Neither declares wrongdoing, legal validity or binding compensation.

Not implemented: external email/SMS/push reminders, bank/PFA/insurer integrations, benefit transfers, Passport export/sharing, employment verification marketplace, employer dashboards, native mobile apps, family claim readiness or retirement planning. Expanded multi-policy history and new-job onboarding are future possibilities, not hackathon capabilities.

Operational limitations, including the unresolved direct storage-deletion denial and verified recovery requirements, are tracked in the [deployment guide](../deployment/RUMPTY_DEPLOYMENT.md) and [security specification](../security/SECURITY.md). Use fictional data for evaluation.
