# Treviqo Hacktober Milestones

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

Implementation record: [Milestone 0 foundation](FOUNDATION.md). The repository foundation is implemented; credentials authentication is implemented and locally validated; live Rumpty deployment remains pending configuration.

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
