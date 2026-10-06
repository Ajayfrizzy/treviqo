# Treviqo

Treviqo (treh-VEE-koh) is a worker-owned employment and benefits continuity platform. This repository implements **Milestones 0–7**: application-managed authentication, employment records, private document storage, reviewed AI extraction, Job Exit Checker, settlement comparison, pension verification, and Benefit Passport. In-app reminders and a recoverable Redis/PostgreSQL background worker support outstanding actions.

## Local setup

Use Node.js 22 LTS (see `.nvmrc`) and npm. Docker is optional for local PostgreSQL and Redis.

```sh
npm ci
cp .env.example .env
npm run dev
```

With empty integrations, the app renders a sign-in unavailable state; protected pages redirect to sign-in. No credentials are required to install, test, or build. Environment files are ignored by Git.

For local databases, fill `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` in `.env`, then run `docker compose up -d`. Set `DATABASE_URL` to your local PostgreSQL connection string (URL-encode credentials) and `REDIS_URL` to `redis://localhost:6379`. Prisma and Next.js read `.env`; integration tests expect variables exported in the shell.

```sh
npm run db:deploy
npm run dev
```

To enable sign-in, configure PostgreSQL, Redis, matching `APP_URL`/`NEXTAUTH_URL`, and `SESSION_SECRET` from `.env.example`; see [deployment setup](docs/deployment/RUMPTY_DEPLOYMENT.md). No third-party hosted identity service is required. Never point tests at production.

## Document intelligence

From a ready document, choose **Extract and review details**. Contracts, payslips, resignation letters, termination letters, final settlements, and pension statements are supported. Text-based PDFs can be read locally before text goes to Rumpty AI; scans/images use pasted transcription or manual field entry. Proposals remain untrusted until individually confirmed or corrected. Reject/unknown states and correction history are preserved; reviews do not update employment records or run exit/benefit rules.

Set all three `RUMPTY_AI_BASE_URL`, `RUMPTY_AI_API_KEY`, and `RUMPTY_AI_MODEL` variables to enable inference. Leave all blank to use manual entry. The isolated adapter uses an OpenAI-compatible chat-completions protocol; confirm the actual Rumpty endpoint contract before deployment. No OpenAI service or SDK is used. Tests run against local synthetic fixtures without live inference.

See [Milestone 3 design, validation, and limits](docs/milestones/AI_DOCUMENT_INTELLIGENCE.md).

## Job Exit Checker

Open **Exit**, choose an employment record, and select resignation, termination, redundancy, contract completion, or retirement. The exit type and planned/actual last working date are required. Save after those details and return to complete notice, money/pension, and records/benefits steps. Unknown answers remain explicit.

Nine deterministic checks show Complete, Pending, Missing, Needs clarification, or Not applicable, with explanations and next actions. Optional notice evidence must be a specifically selected Confirmed/Corrected contract field; AI never chooses checklist states. Deleted evidence and changed reviews are re-evaluated when you open the checklist. Complete means the described record/answer check is satisfied, not legal validity, verified payment, or confirmed contributions.

Each employment has one editable case; creating it does not close employment. No additional environment variables or dependencies are needed. See [Milestone 4 implementation and rule coverage](docs/milestones/JOB_EXIT_CHECKER.md).

## Settlement and pension

From an exit checklist, open **Review settlement and pension**. Upload/reuse a final settlement and pension statement in Documents, then confirm or correct extracted fields. Add settlement comparisons against reviewed evidence from the same employment; explicit amounts and worker-identified periods are compared deterministically, with clarification flags rather than legal/payment conclusions.

Pension review matches employer and contribution month, optionally checks the reviewed payslip employee deduction, and requires explicit confirmation. Changed evidence invalidates confirmation. A saved follow-up date drives in-app reminders when the background worker runs; no external notifications are sent. Statement review currently supports three separate contribution entries and requires a worker completeness check. See [Milestone 5 implementation, validation, and limits](docs/milestones/SETTLEMENT_PENSION.md).

## Benefit Passport

**Passport** shows closed employments as a personal timeline with original dates/roles, current exit/document status, reviewed pension provider and final-contribution verification. Correct existing facts at their source; Passport refreshes from them instead of maintaining a second copy.

Benefit assessments default to Unknown. Portable or Employer-linked requires your selection of supporting evidence and acknowledgment; category alone never determines portability or active coverage. Changed evidence/context invalidates earlier assessments. Sensitive identifiers are omitted/masked; this is not a downloadable legal record or employer-verification product. See [Milestone 6 implementation and limits](docs/milestones/BENEFIT_PASSPORT.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types and strict TypeScript checks |
| `npm test` | Isolated unit/security tests |
| `npm run test:integration` | PostgreSQL/Redis tests; exported test URLs required |
| `npm run test:e2e` | Chromium shell, navigation, auth boundary, and responsive checks |
| `npm run build` | Generate Prisma client and production build |
| `npm start` | Run built app (set production environment, including HTTPS APP_URL) |
| `npm run validate` | Lint, typecheck, unit tests, build |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate -- --name <name>` | Create/apply a development migration |
| `npm run db:deploy` | Apply committed migrations without reset |

Install the browser once with `npx playwright install chromium`. CI runs all checks, migrations, integration tests, and browser tests. Browser journeys register and sign in through the real application routes against disposable services. Only dedicated expired-cookie tests construct synthetic cookies.

## Structure

```text
src/app/                 App Router pages and API transport
src/components/          Shared mobile-first presentation
src/modules/auth/        Credentials, encrypted sessions, authorization helpers
src/modules/finance/     Settlement comparisons and pension verification
src/modules/passport/    Closed-employment summaries and benefit assessments
src/server/config/       Validated server-only environment
src/server/db/           PostgreSQL/Prisma client
src/server/redis/        Lazy Redis connection
src/server/storage/      Explicit-endpoint private-storage boundary
prisma/                  Owned domain models and versioned migrations
tests/                   Unit, service integration, browser checks
docs/                    Product, architecture,security, deployment guidance
```

Keep future business logic in `src/modules/<domain>` and validate authorization in every server/API operation. A protected page layout does not authorize an API endpoint.

## Deployment

The multistage [Dockerfile](Dockerfile) produces a non-root standalone Next.js runtime and a separate `migrate` target. Use Rumpty for all production infrastructure. See [deployment instructions](docs/deployment/RUMPTY_DEPLOYMENT.md) and the [foundation implementation record](docs/milestones/FOUNDATION.md).

`GET /api/health` is process liveness; `GET /api/ready` checks the migrated database, Redis, bucket connectivity, and auth configuration. Readiness returns generic `503` responses when integrations are missing or unreachable. It does not prove inference availability or bucket privacy.

## Reminders and reliability

Home → **View reminders** lists current exit actions, missing records, pension follow-ups and unchanged actions. Open the source, snooze seven days, or dismiss the current prompt. Changed evidence is rechecked.

Run `npm run worker:build` and `npm run worker` in a separate process with exported database/Redis configuration; the worker does not automatically load `.env`. Alternatively run `node --env-file=.env --conditions=react-server dist-worker/worker/main.js`. `npm run worker:health` checks background progress. Production readiness requires a healthy worker by default. See [Milestone 7 implementation](docs/milestones/REMINDERS_RELIABILITY_SECURITY.md) and [worker/backup operations](docs/deployment/RUMPTY_DEPLOYMENT.md#milestone-7-worker-and-recovery-runbook).

## First Rumpty deployment

Use the [production-like deployment runbook](docs/deployment/FIRST_RUMPTY_DEPLOYMENT.md). After `npm run worker:build`, `npm run deployment:check` validates exported production configuration; explicit flags enable controlled synthetic service/storage/AI/runtime probes. No real Rumpty service is claimed connected without live acceptance evidence.
