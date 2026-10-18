# Treviqo Hacktober Milestones

## Current status — final documentation review

The web application is available at [treviqo.rumptycloud.app](https://treviqo.rumptycloud.app). Milestones 0–7 have implementations, with later additions including personal profiles, eight extraction categories, scheduled deletion, extraction recovery and responsive navigation. UI polish and the [demo guide](../product/DEMO.md) support the final hackathon review. A shared seeded demo account is not supplied.

Direct storage deletion remains blocked by HTTP 403 in production and a dedicated test bucket; RumptyCloud support has been contacted. Recovery requires verified absence. Deployment availability does not establish all acceptance criteria, backup readiness or provider compatibility. See [current operational status](../deployment/S3_DELETE_AUTHORIZATION_INVESTIGATION.md#current-live-status).

The milestones below preserve the delivery plan. Linked implementation reports are historical; their counts and then-pending features are not current limitations.

## Milestone 0 — Project Foundation

Deliver:

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

Success:
A minimal authenticated Treviqo app is live on Rumpty and connected to production-equivalent infrastructure.

Implementation record: [Milestone 0 foundation](FOUNDATION.md). The repository foundation is implemented; credentials authentication is implemented and locally validated; the current live address and remaining acceptance limitations are listed above.

## Milestone 1 — Employment Records & Mobile Shell

Deliver:

- onboarding
- create/edit employment
- employer/role/start date
- employment history
- bottom navigation
- responsive desktop expansion
- empty/loading/error states

Success:
Employment records work comfortably from mobile.

Implementation record: [Milestone 1 employment records](EMPLOYMENT_RECORDS.md).

## Milestone 2 — Secure Document Vault

Deliver:

- private uploads
- metadata
- categories
- signed access
- list/detail
- authorization
- deletion
- audit events
- mobile upload

Success:
Users can safely manage their own evidence.

Implementation record: [Milestone 2 document vault](DOCUMENT_VAULT.md).

## Milestone 3 — AI Document Intelligence

Deliver:

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

Success:
Useful proposed data can be reviewed and confirmed.

Implementation record: [Milestone 3 document intelligence](AI_DOCUMENT_INTELLIGENCE.md).

## Milestone 4 — Job Exit Checker

Deliver:

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

Success:
Worker gets a useful evidence-grounded checklist.

Implementation record: [Milestone 4 Job Exit Checker](JOB_EXIT_CHECKER.md).

## Milestone 5 — Final Settlement & Pension Verification

Deliver:

- settlement upload
- structured settlement items
- comparison against known evidence
- clarification flags
- final pension verification
- pension extraction
- contribution matching
- reminders

Success:
Treviqo can highlight missing/unclear items without making legal claims.

Implementation record: [Milestone 5 settlement and pension](SETTLEMENT_PENSION.md). Follow-up dates now drive the in-app reminder worker delivered in Milestone 7.

## Milestone 6 — Benefit Passport v1

Deliver:

- closed-employment summary
- employment timeline
- benefit classification
- document status
- pension verification status
- mobile Passport UX

Success:
Worker retains a useful personal record after exit.

Implementation record: [Milestone 6 Benefit Passport](BENEFIT_PASSPORT.md). Entries derive from current closed employment. Export is not implemented; reminders are delivered by the separate reminder module.

## Milestone 7 — Reminders, Reliability & Security

Deliver:

- Redis/background jobs
- deadlines/reminders
- security review
- authorization review
- audit logging
- rate limiting where appropriate
- backup/snapshot strategy

Success:
Treviqo behaves like a persistent product, not a one-session demo.

Implementation record: [Milestone 7 reminders, reliability and security](REMINDERS_RELIABILITY_SECURITY.md).

## Milestone 8 — Hackathon Polish

Deliver:

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

Success:
A judge understands Treviqo within the first minute and can complete the primary workflow without assistance.

Focused implementation record: [Production UI/UX polish](UI_UX_POLISH.md). This covers the existing MVP interface only; it does not claim completion of demo preparation or deployment.

## Priority if time is constrained

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
