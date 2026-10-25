# Treviqo

**Treviqo (treh-VEE-koh)** helps workers keep their employment records, exit evidence and benefits history together as they move between employers.

Employment information is often scattered across contracts, payslips, pension statements and former employers' systems. Treviqo gives the individual a place to preserve that evidence, review outstanding exit actions and carry a personal history into the next job.

Built for the **Devcenter Hacktober 2026 × RumptyCloud** hackathon, October 1–31, 2026. The initial audience is Nigerian salaried workers navigating resignation, termination, redundancy, contract completion or retirement.

**Live application:** [treviqo.rumptycloud.app](https://treviqo.rumptycloud.app)

[Product overview](docs/product/PRODUCT.md) · [Reproducible demo](docs/product/DEMO.md) · [Documentation index](docs/README.md)

## For hackathon judges

| Judging criterion              | What to inspect                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform Deployment            | Open the RumptyCloud app above and follow the [six-minute walkthrough](docs/product/DEMO.md#six-minute-live-walkthrough). Demonstrate working screens and evidence review; hosting alone does not prove every integration works.                                                      |
| Code Quality & Tech Docs       | Inspect the [module boundaries](docs/architecture/ARCHITECTURE.md#current-implementation), [authorization rules](docs/security/SECURITY.md#current-security-boundaries), [test instructions](docs/testing/TESTING.md) and [deployment runbook](docs/deployment/RUMPTY_DEPLOYMENT.md). |
| Innovation & Practical Utility | Follow one worker across employers: original evidence, explicit review, exit discrepancies, settlement/pension checks and unresolved actions stay connected through the Benefit Passport. See the [product boundaries](docs/product/PRODUCT.md).                                      |

## The product journey

1. **Build your employment history.** Create multiple roles, record dates and employment status, and keep each employer's evidence separate.
2. **Save documents privately.** Upload PDF, JPEG or PNG evidence under the correct employment. Access originals through short-lived, authorized download links.
3. **Extract and review facts.** Rumpty AI proposes document fields with source excerpts. Confirm, correct, reject or leave them unknown; manual entry remains available.
4. **Start a Job Exit Checker.** Save an exit case and return to nine deterministic checks covering notice, salary records, leave, reimbursements, pension, assets, exit documents, references and benefits.
5. **Review settlement and pension evidence.** Compare selected reviewed amounts and periods; inspect contribution entries and explicitly confirm a supported pension match.
6. **Preserve your Benefit Passport.** Close employment to include it in a timeline across completed jobs. Assess benefits as portable, employer-linked or unknown using evidence from that employment.
7. **Return to unresolved actions.** In-app reminders link back to the source, support seven-day snooze/dismissal, and recheck evidence when it changes.

Profile supports personal details and scheduled account deletion with a seven-day cancellation window. On phones, Home, Exit, Reminders and Passport are directly available; **More** opens Documents and Profile. Larger screens expose all six destinations.

Treviqo is employee-facing. It does not run payroll, transfer benefits, contact pension providers, determine legal entitlement or declare employer wrongdoing. A matching record is not proof of payment or active coverage.

## Technology and architecture

A **Next.js 16 / React 19 modular monolith** serves the web UI and Node.js API routes in strict TypeScript. A separate Node.js worker runs the same domain services; no separate microservice API is required.

| Component                       | Responsibility                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| RumptyCloud application hosting | Next.js web/API runtime and separate always-on worker                                                |
| PostgreSQL + Prisma 6           | Owned employment/evidence records, review history, audits, sessions, reminders and durable job state |
| Redis                           | Rate limits, recoverable due-job queue and worker heartbeat                                          |
| Private S3-compatible storage   | Original documents, accessed through the explicit Rumpty endpoint                                    |
| Rumpty AI                       | Classification and grounded field proposals over an OpenAI-compatible HTTP protocol                  |
| NextAuth 4 + Argon2id           | Application-managed credentials, encrypted cookies and revocable database sessions                   |
| Vitest + Playwright             | Domain, authorization, integration, browser and responsive checks                                    |

The AWS SDK is an S3 protocol client here, not an AWS hosting dependency. The AI adapter uses Rumpty's configured endpoint; it does not use the OpenAI service or SDK.

See [architecture and module map](docs/architecture/ARCHITECTURE.md), [domain rules](docs/domain/DOMAIN_RULES.md) and [AI pipeline](docs/ai/AI_DOCUMENTS.md).

## Local development

Use Node.js 22 LTS (see [.nvmrc](.nvmrc)), npm and PostgreSQL/Redis. [Docker Compose](compose.yaml) provides local PostgreSQL 17 and Redis 7 if desired. Run commands from the repository root.

```sh
npm ci
cp .env.example .env
```

Copy the template only for a new checkout; do not overwrite an existing `.env`. Edit the file locally using [.env.example](.env.example):

| Variables                                                                           | Setup                                                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `APP_URL`, `NEXTAUTH_URL`                                                           | Matching origins; the template uses localhost port 3000                                           |
| `SESSION_SECRET`                                                                    | Generate a private random secret of at least 32 characters                                        |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                                 | Local Compose inputs only                                                                         |
| `DATABASE_URL`, `REDIS_URL`                                                         | Your local database/cache connections; URL-encode credential components                           |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Complete group for a dedicated private development bucket; never use production storage for tests |
| `S3_FORCE_PATH_STYLE`, `S3_VERSIONING`                                              | Match the actual provider addressing and bucket mode; defaults are `true` and `unversioned`       |
| `DOCUMENT_MAX_FILE_MB`                                                              | Upload limit, default 10 MiB; allowed range 1–20                                                  |
| `RUMPTY_AI_BASE_URL`, `RUMPTY_AI_API_KEY`, `RUMPTY_AI_MODEL`                        | Optional complete group; leave all three blank for manual review                                  |
| `RUMPTY_AI_TIMEOUT_MS`                                                              | Per-call deadline, default 60000 ms; range 10000–90000                                            |
| `WORKER_REQUIRED`                                                                   | Readiness requires the worker by default in production; blank is optional in development          |

After configuring local services:

```sh
docker compose up -d
npm run db:deploy
npm run dev
```

Open `http://localhost:3000` and create an account. If using existing local PostgreSQL/Redis, skip Compose. Authentication needs PostgreSQL, Redis and auth configuration. Documents additionally need storage; leaving storage blank does not create a local document store. Builds and isolated unit tests do not need live Rumpty credentials.

In a second terminal, start the worker:

```sh
npm run worker:build
node --env-file=.env --conditions=react-server dist-worker/worker/main.js
```

Next.js and Prisma load `.env`; the compiled worker does not unless you pass `--env-file` or export variables. `npm run worker` uses exported configuration. Keep environment files private and ignored; never put credentials in `NEXT_PUBLIC_*` variables.

## AI and evidence review

Eight extraction categories are implemented: employment contract, payslip, resignation letter, termination letter, exit letter, final settlement, pension statement and benefit document. Other uploaded evidence can still be stored without a dedicated extraction schema.

Text-based PDFs are prepared locally before bounded text is sent to Rumpty AI. Images and scanned PDFs need a supplied transcription or manual entry; there is no OCR service. Model output is validated against source excerpts, with narrow source-label recovery where supported. Proposals remain untrusted until the user reviews them. Extraction does not silently update employment dates, exit type or benefit portability.

Semantic accuracy still needs human review. Invalid, incomplete or unavailable inference has retry/manual fallback; no paid automatic inference retry is performed. See [supported fields and limitations](docs/ai/AI_DOCUMENTS.md).

## Testing

| Command                               | Purpose                                                             |
| ------------------------------------- | ------------------------------------------------------------------- |
| `npm run lint`                        | ESLint                                                              |
| `npm run typecheck`                   | Generate route types and run strict TypeScript checks               |
| `npm test`                            | Unit/security tests, including local protocol fixtures              |
| `npm run test:integration`            | PostgreSQL/Redis service tests against disposable services          |
| `npm run test:e2e`                    | Build worker, then run Playwright browser journeys                  |
| `npm run build`                       | Generate Prisma client and build production web application         |
| `npm run worker:build`                | Compile worker and operator tools                                   |
| `npm run validate`                    | Lint, TypeScript, unit tests, production build **and worker build** |
| `npm run db:deploy`                   | Apply committed migrations to the selected database                 |
| `npm run db:migrate -- --name <name>` | Create/apply a development migration                                |

For integration/browser tests, export `DATABASE_URL` and `REDIS_URL` for **disposable test services**, apply all migrations there, and install Chromium with `npx playwright install chromium`. Do not load a production `.env` into tests. Integration suites mutate data and browser fixtures are not production storage. `validate` does not run integration or browser suites; CI runs those separately.

[Testing strategy and commands](docs/testing/TESTING.md) · [CI workflow](.github/workflows/ci.yml)

## Deployment and operations

See the [dated production evidence](docs/deployment/RUMPTY_DEPLOYMENT.md#current-deployment-and-known-limitation) for reported web/worker health, direct deletion results and remaining reminder-sweep verification.

The [Dockerfile](Dockerfile) provides `runtime`, `worker` and `migrate` targets. The default image is the web application. Run a migration release job and deploy matching web/worker revisions with runtime secrets, private PostgreSQL/Redis, private object storage and HTTPS. The worker requires storage access for scheduled account cleanup, but no inference credentials.

Web `/api/health` is process liveness; `/api/ready` checks database, Redis, auth configuration, bucket connectivity and worker health when required. Worker `/health` reports its local progress. These checks do not prove AI accuracy, bucket privacy or DELETE permission.

[Deployment configuration and recovery](docs/deployment/RUMPTY_DEPLOYMENT.md) · [Release acceptance procedure](docs/deployment/FIRST_RUMPTY_DEPLOYMENT.md)

## Security, privacy and limits

- Ownership is checked in server services and API operations, including same-user/different-employment evidence boundaries. A protected page alone is not authorization.
- Private uploads have MIME/signature/size checks and sanitized filenames. Download links are short-lived bearer credentials; never publish them.
- Important actions are audited without document contents. Passwords use salted Argon2id hashes, and database-backed sessions support revocation.
- No email verification, password recovery, MFA, external notifications, provider integrations, benefit transfers, Passport export or native mobile app is implemented.
- Pension review supports up to three separate contribution entries, requires a completeness check and explicit user confirmation, and cannot guarantee reconciliation with a PFA.
- **Storage cleanup requires verified absence.** A 403 still never proves absence. See [current production evidence and recovery limits](docs/deployment/RUMPTY_DEPLOYMENT.md#current-deployment-and-known-limitation).

[Security boundaries](docs/security/SECURITY.md) · [Account deletion lifecycle](docs/security/ACCOUNT_DELETION.md)

## Documentation

Start with the [documentation index](docs/README.md). The [product overview](docs/product/PRODUCT.md) and [demo guide](docs/product/DEMO.md) are intended for judges; architecture, domain, AI, security, testing and deployment guides cover implementation and operation. Dated milestone reports preserve historical validation and are not current production acceptance certificates.

