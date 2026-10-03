# Treviqo — Codex Project Instructions

Treviqo (pronounced **treh-VEE-koh**) is a worker-owned employment and benefits continuity platform.

## Hackathon scope
Build period: October 1–31, 2026.
Treviqo must be live on Rumpty Cloud.

Core MVP:
- employment records
- secure employment-document storage
- AI-assisted document extraction
- Job Exit Checker
- final-settlement review
- pension exit verification
- benefit classification
- Benefit Passport v1
- reminders and outstanding-action tracking

Treviqo is employee-facing, not employer-facing.

## Infrastructure
Use Rumpty Cloud for:
- application hosting
- PostgreSQL
- Redis
- S3-compatible object storage
- AI inference
- background workers
- monitoring/deployment

Do not introduce another competing infrastructure provider without explicit approval.

## Technology
Preferred:
- TypeScript
- Next.js / React
- Node.js
- PostgreSQL
- Prisma
- Redis
- S3-compatible object storage
- Docker where appropriate

Prefer strict TypeScript and avoid unnecessary dependencies.

## Mobile-first rule
Treviqo is web-first for the hackathon and native-mobile later.

Design mobile first:
- bottom navigation for primary mobile sections
- cards and step flows instead of dense tables
- mobile-friendly uploads
- app-like sheets/drawers/actions
- desktop expands the mobile information architecture

Do not design desktop first and simply shrink it.

## Product boundaries
Do not turn Treviqo into:
- payroll
- HR management
- recruitment
- employee monitoring
- a job board
- a pension provider
- an insurer
- a bank
- a legal-dispute platform
- an employment-law chatbot
- a generic document manager

## AI principle
AI may:
- classify documents
- extract structured fields
- identify relevant clauses
- extract payslip/pension values
- provide short evidence-grounded summaries

AI must not:
- determine legal entitlement
- declare employer wrongdoing
- calculate binding compensation
- invent information
- make unsupported legal conclusions

Important extracted information must be user-confirmed before it becomes trusted data.

## Rules-engine principle
AI extracts facts; deterministic rules interpret them.

Preferred:
> Your submitted dates appear consistent with the 30-day notice period stated in your contract.

Avoid:
> Your resignation is legally valid.

Preferred:
> An approved ₦48,000 reimbursement was not identified in the uploaded final-settlement document. Confirm this with your employer.

Avoid:
> Your employer owes you ₦48,000.

## Core domain objects
- User
- Employment
- Employer
- EmploymentDocument
- ExtractedField
- Benefit
- ExitCase
- ExitChecklistItem
- SettlementItem
- PensionVerification
- Reminder
- PassportEntry
- AuditEvent

## Exit types
- resignation
- termination
- redundancy
- contract completion
- retirement

## Benefit categories
- pension/RSA
- HMO
- employer group life
- employer-specific benefits
- cooperative benefit
- provident/retirement plans where applicable

Classify benefits as:
- portable
- employer-linked
- unknown/needs confirmation

## Document types
- employment contract
- payslip
- resignation letter
- termination letter
- exit letter
- pension statement
- final-settlement document
- reimbursement/expense evidence
- benefit document
- generic other

## Security
- private object storage
- time-limited signed access where supported
- ownership checks
- no public document URLs
- MIME and size validation
- sanitized filenames
- audit important actions
- never store plaintext passwords, PINs, or banking credentials; application-managed authentication may persist salted password hashes, and runtime secrets belong only in environment configuration

## Data quality
Every AI-derived field should support:
- source document
- confidence/review status
- user confirmation
- correction history where appropriate

Original source documents remain the evidence.

## UX language
Prefer:
- Needs clarification
- Waiting for confirmation
- Not found in uploaded documents
- Complete

Avoid:
- Violation
- Fraud
- Illegal
- Owed

unless quoting authoritative source text.

## Mobile navigation
- Home
- Exit
- Passport
- Documents
- Profile

## Testing
Every milestone must maintain:
- passing TypeScript checks
- passing lint
- passing automated tests
- tested mobile layouts
- loading/error/empty states

Domain rules require unit tests.
Document access requires authorization tests.
AI tests should primarily use fixtures.

## Rumpty AI
Assume a relatively small open-source model.
Prompts should be narrow, schema-driven, explicit, short, and grounded only in supplied content.
Always provide manual fallback.

## Implementation discipline
Before implementing a milestone:
1. Read this file.
2. Read relevant docs under `docs/`.
3. Inspect existing implementation.
4. Extend existing abstractions instead of duplicating.
5. Write/update tests.
6. Run validation commands.
7. Report changed files, tests, failures, and manual checks.

## Scope discipline
Post-hackathon unless explicitly promoted:
- family claim readiness
- retirement readiness
- employer dashboards
- bank/PFA/insurer integrations
- employment verification marketplace
- native mobile application

Prioritize a polished, reliable MVP over feature count.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
