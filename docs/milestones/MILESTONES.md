# Treviqo Hacktober Milestones

## Current status — final documentation review

The web application is available at [treviqo.rumptycloud.app](https://treviqo.rumptycloud.app). Milestones 0–7 have implementations, with later additions including personal profiles, eight extraction categories, scheduled deletion, extraction recovery and responsive navigation. UI polish and the [demo guide](../product/DEMO.md) support the final hackathon review. A shared seeded demo account is not supplied.

See [current production evidence](../deployment/RUMPTY_DEPLOYMENT.md#current-deployment-and-known-limitation) for operator-reported deployment results and remaining verification. Implementation is not the same as completed live acceptance.

## Implemented scope and outstanding preparation

- **Implemented:** employment records, private documents, reviewed AI proposals, Exit Checker, settlement/pension review, Benefit Passport and in-app reminders. Later additions include scheduled account deletion, extraction recovery and responsive navigation. See the [product overview](../product/PRODUCT.md) for current boundaries.
- **Prepared in the repository:** technical documentation, the six-minute demo guide and Harbour synthetic PDFs with expected-value references.
- **Still requires presenter preparation:** create a fictional account through the UI, prepare/review its evidence, rehearse the live route and verify that due reminders are available. No shared seeded demo account is supplied.
- **Optional and not supplied:** Zara’s fictional document pack. Continue using Harbour until matching fixtures and a review manifest are committed; do not relabel existing evidence.
- **Still requires operational evidence:** a complete successful reminder sweep and the remaining acceptance checks in the deployment runbook. Passing deployment health alone does not certify these.

## Original implementation plan

The milestone sections below retain the original planning scope and intended success criteria, **not a checklist of delivered features**. The linked reports record implementation at their dates. For example, the Milestone 8 seeded demo account remains unsupplied, and backup/restore planning does not establish a successful restore drill.

## Milestone 0 — Project Foundation

Original planned scope:

- repository structure
- Codex docs
- Next.js/TypeScript foundation
- backend architecture
- environment config
- PostgreSQL + Prisma
- Redis
- object-storage abstraction
- auth foundation
- CI/basic validation
- mobile-first design tokens
- initial Rumpty deployment

Original acceptance goal (not a completion claim):
A minimal authenticated Treviqo app is live on Rumpty and connected to production-equivalent infrastructure.

Implementation record: [Milestone 0 foundation](../archive/milestones/FOUNDATION.md). The repository foundation is implemented; credentials authentication is implemented and locally validated; the current live address and remaining acceptance limitations are listed above.

## Milestone 1 — Employment Records & Mobile Shell

Original planned scope:

- onboarding
- create/edit employment
- employer/role/start date
- employment history
- bottom navigation
- responsive desktop expansion
- empty/loading/error states

Original acceptance goal (not a completion claim):
Employment records work comfortably from mobile.

Implementation record: [Milestone 1 employment records](../archive/milestones/EMPLOYMENT_RECORDS.md).

## Milestone 2 — Secure Document Vault

Original planned scope:

- private uploads
- metadata
- categories
- signed access
- list/detail
- authorization
- deletion
- audit events
- mobile upload

Original acceptance goal (not a completion claim):
Users can safely manage their own evidence.

Implementation record: [Milestone 2 document vault](../archive/milestones/DOCUMENT_VAULT.md).

## Milestone 3 — AI Document Intelligence

Original planned scope:

- Rumpty AI
- classification
- structured extraction
- user confirmation
- confidence/review
- manual correction
- fixtures
- retries/errors

Start with:

1. contracts
2. payslips
3. resignation/termination letters

Original acceptance goal (not a completion claim):
Useful proposed data can be reviewed and confirmed.

Implementation record: [Milestone 3 document intelligence](../archive/milestones/AI_DOCUMENT_INTELLIGENCE.md).

## Milestone 4 — Job Exit Checker

Original planned scope:

- exit-case creation
- all supported exit types
- dates
- deterministic rules
- personalised checklist
- states and explanations

Rule categories:

- notice
- final salary
- unused leave
- reimbursements
- pension
- company assets
- exit docs
- references/evidence
- employer-linked benefits

Original acceptance goal (not a completion claim):
Worker gets a useful evidence-grounded checklist.

Implementation record: [Milestone 4 Job Exit Checker](../archive/milestones/JOB_EXIT_CHECKER.md).

## Milestone 5 — Final Settlement & Pension Verification

Original planned scope:

- settlement upload
- structured settlement items
- comparison against known evidence
- clarification flags
- final pension verification
- pension extraction
- contribution matching
- reminders

Original acceptance goal (not a completion claim):
Treviqo can highlight missing/unclear items without making legal claims.

Implementation record: [Milestone 5 settlement and pension](../archive/milestones/SETTLEMENT_PENSION.md). Follow-up dates now drive the in-app reminder worker delivered in Milestone 7.

## Milestone 6 — Benefit Passport v1

Original planned scope:

- closed-employment summary
- employment timeline
- benefit classification
- document status
- pension verification status
- mobile Passport UX

Original acceptance goal (not a completion claim):
Worker retains a useful personal record after exit.

Implementation record: [Milestone 6 Benefit Passport](../archive/milestones/BENEFIT_PASSPORT.md). Entries derive from current closed employment. Export is not implemented; reminders are delivered by the separate reminder module.

## Milestone 7 — Reminders, Reliability & Security

Original planned scope:

- Redis/background jobs
- deadlines/reminders
- security review
- authorization review
- audit logging
- rate limiting where appropriate
- backup/snapshot strategy

Original acceptance goal (not a completion claim):
Treviqo behaves like a persistent product, not a one-session demo.

Implementation record: [Milestone 7 reminders, reliability and security](../archive/milestones/REMINDERS_RELIABILITY_SECURITY.md).

## Milestone 8 — Hackathon Polish

Original planned scope:

- mobile UX polish
- desktop refinement
- accessibility
- responsive testing
- onboarding refinement
- seeded demo account/data
- realistic demo docs
- production error handling
- README
- architecture docs
- setup/deployment docs
- demo script
- judge walkthrough
- final Rumpty production deployment

Original acceptance goal (not a completion claim):
A judge understands Treviqo within the first minute and can complete the primary workflow without assistance.

Focused implementation record: [Production UI/UX polish](../archive/milestones/UI_UX_POLISH.md). This covers the existing MVP interface only; it does not claim completion of demo preparation or deployment.

## Original prioritization guidance

Protect:

1. Employment records
2. Documents
3. AI extraction
4. Job Exit Checker
5. Settlement review
6. Pension verification
7. Benefit Passport

Reduce:

- decorative analytics
- advanced animations
- nonessential filters
- secondary document types
- advanced export
- optional roadmap features
