# Treviqo Rumpty Cloud Deployment

## Principle
Use Rumpty infrastructure wherever the platform provides the needed capability.

Avoid competing infrastructure providers.

## Confirmed foundation services

Confirmed from the participant dashboard and onboarding: PostgreSQL, Redis 8.1, S3-compatible object storage, AI inference, and application deployment/compute. Managed OIDC/identity provider support is not assumed. Authentication is application-managed credentials authentication hosted with Treviqo on Rumpty Cloud, backed by Treviqo PostgreSQL.

## Services used/planned
- application compute/deployment
- PostgreSQL
- Redis
- S3-compatible object storage
- AI inference
- worker compute
- volumes where needed
- snapshots/backups
- monitoring/status tooling

## Target topology
```text
Rumpty App/Compute
  - web
  - API

Rumpty PostgreSQL
  - source of truth

Rumpty Redis
  - queues/cache/locks

Rumpty Private Bucket
  - employment documents

Rumpty AI
  - classification
  - extraction

Rumpty Worker
  - document jobs
  - reminders
  - pension follow-up
```

## GitHub integration
Where supported:
- connect repo
- deploy protected main
- use preview environments when useful
- use CVE scanning

## Environments
Ideal:
- local
- Rumpty preview/staging
- Rumpty production

If credits limit this, prioritize production while keeping configuration clean.

## Expected environment variables
```text
DATABASE_URL=
REDIS_URL=

S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

RUMPTY_AI_BASE_URL=
RUMPTY_AI_API_KEY=
RUMPTY_AI_MODEL=

APP_URL=
SESSION_SECRET=
```

Actual names should follow Rumpty docs.

## PostgreSQL
- Prisma migrations
- repeatable deployment
- no destructive production reset

## Redis
Prefer internal/private connections where practical.

## Object storage
Private bucket only.

## AI
Test:
- schema adherence
- contract extraction
- payslip extraction
- length limits
- latency
- errors

Always keep manual fallback.

## Scale-to-zero
If the plan scales to zero, account for cold starts during judging.
Warm the app before demo.

## Persistence
Do not store important state on ephemeral app disks.

## Backups
Take snapshots/backups before judging and document recovery.

## Production checklist
- public app reachable
- HTTPS
- migrations applied
- private docs tested
- AI works
- Redis jobs work
- secrets configured
- logging available
- mobile path tested
- README updated

## Hackathon evidence
Document which Rumpty services Treviqo uses and why.

## Milestone 0 runbook

No Rumpty endpoints, credentials, or deployment project were supplied for the initial implementation. The repository is deployment-ready scaffolding, **not evidence of a live Rumpty deployment**.

1. Provision Rumpty PostgreSQL and Redis on private network endpoints. Use least-privilege application credentials and configure TLS according to Rumpty's connection guidance. Set bounded PostgreSQL connection/pool timeouts and size the pool for the selected compute plan.
2. Provision a private Rumpty S3-compatible bucket. Block public access/ACLs at the provider, restrict credentials to the selected bucket, and configure TLS. The adapter supports HeadBucket, private PutObject, signed GetObject, and DeleteObject; successful readiness does not verify a bucket policy. Confirm privacy independently in Rumpty before storing any documents.
3. Authentication runs in the web app. Set identical canonical `APP_URL` and `NEXTAUTH_URL`. Apply the credentials migration, then use `/register` and `/sign-in`. No identity-service deployment or OIDC client is required. Registration uses Argon2id password hashing; allocate enough memory for 64 MiB per concurrent hashing operation, benchmark latency, and configure ingress concurrency/body limits and per-client throttling before public exposure.
4. Set secrets through Rumpty's secret/environment configuration. Never pass secrets as Docker build arguments. Generate `SESSION_SECRET` using `openssl rand -base64 48` and store its output directly in secret configuration.
5. Build `docker build --target migrate -t treviqo-migrate .` and execute that image as a one-off release job with `DATABASE_URL` injected. It runs `prisma migrate deploy`. Back up existing data before migrations; never use `migrate reset` in production.
6. Build `docker build --target runtime -t treviqo .` and deploy port 3000 behind Rumpty HTTPS ingress. Set the environment variables below. Use `/api/health` for liveness and `/api/ready` for readiness. Add edge request limits to health/readiness/auth routes; the application enforces a global circuit-breaker plus per-email throttling. Keep clocks synchronized for session expiry.
7. Verify a real registration, duplicate-email handling, sign-in, refresh/navigation, `/api/me`, sign-out, invalid/expired session rejection, mobile navigation, private network access, bucket privacy, logs, and a PostgreSQL backup restore. Enable HTTPS/HSTS at ingress. No job or AI connectivity is needed until those milestones.

### Implemented runtime variables

| Variables | Purpose |
| --- | --- |
| `APP_URL`, `NEXTAUTH_URL` | Identical canonical app origin; HTTPS in production |
| `SESSION_SECRET` | At least 32 characters of generated entropy; encrypts sessions |
| `DATABASE_URL` | Rumpty PostgreSQL connection string |
| `REDIS_URL` | Rumpty Redis connection string |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | Explicit Rumpty object-storage location |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Least-privilege bucket credentials |
| `DOCUMENT_MAX_FILE_MB` | Upload limit in MiB; default 10, integer 1–20 |
| `S3_FORCE_PATH_STYLE` | `true` by default; change only to match Rumpty endpoint support |

`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` are local Compose inputs only. `NODE_ENV`, `PORT`, and `HOSTNAME` are supplied by the Docker runtime. AI environment variables are optional as a complete group for Milestone 3; leave all three blank to retain manual review without inference.

Local Compose binds PostgreSQL and Redis to loopback only and uses named volumes. It is not a production deployment definition. `docker compose down` preserves data; do not remove volumes unless deliberately discarding local data.

Recovery: restore a Rumpty PostgreSQL backup into a new database, run migration status checks, update connection configuration, and verify sign-in/readiness before switching traffic. Test actual provider backup/restore procedures in staging; they have not been verified by repository tests.

### Credentials correction deployment notes

The new `20261003010000_credentials_auth` migration is additive: legacy users/IDs are retained, issuer/subject become optional, and email/hash/session fields are added. Legacy users are not assigned invented emails or passwords. No automatic legacy-account conversion is provided. Old cookies without a database session are rejected. Apply migrations before rolling out the new app. No production database was manually modified.

Authentication requires PostgreSQL, Redis, canonical app URLs, and `SESSION_SECRET`. Without these, pages show an unavailable state. Redis remains a confirmed managed Rumpty capability; an unconfigured local environment is not evidence that Redis is unsupported. Rate limiting fails closed when Redis is unreachable. Object storage remains independently configured and is required for full readiness, not registration/login.

NextAuth sessions have an absolute eight-hour database lifetime. Logout deletes the current session, including copied-cookie access; failure is reported for retry. Maintain periodic expiry cleanup and test backup restore with hashes treated as sensitive data. Email verification/recovery, password reset, MFA, and social login remain deferred. No email provider was added.

### Milestone 2 bucket and recovery configuration

Apply `20261003030000_document_vault` before starting the new runtime. Configure the existing S3 variables with real Rumpty values: HTTPS endpoint reachable both from the app and users' browsers, region, private bucket, and restricted credentials. Permit bucket connectivity, PutObject with private ACL, GetObject, and DeleteObject only for the intended bucket/prefix. Confirm Rumpty supports these operations and signed response headers. Uploads pass through the app; downloads use browser navigation, so browser upload CORS is not required.

Block public bucket policies/ACLs independently. Verify an unsigned object request is denied, a signed request works for its owner, and expiry/deletion prevent subsequent reads. Use synchronized clocks. Prefer versioning disabled for this deletion contract; if enabled, DeleteObject can create only a delete marker, so configure and verify version lifecycle/administrative erasure and backup retention. Do not claim all stored versions are erased by the app.

Set ingress body limits consistently with `DOCUMENT_MAX_FILE_MB`, bounded request timeouts, per-client request limits, and concurrent upload limits sized for memory (up to the configured bytes per in-flight request plus buffering overhead). PUT aborts after 30 seconds and DELETE after 10 seconds. Redact signed query strings from logs. Validate network timeouts, least privilege, TLS, privacy, and backup restoration on Rumpty before release.

Recovery: monitor stale Uploaded/Processing rows older than 15 minutes, Failed rows, and Deleting rows. Confirm the upload process is no longer running; have the owner retry removal from the detail page, or run an authenticated/operator-controlled reconciliation using the same deletion service. The durable key enables cleanup even after an ambiguous PUT or database commit. Retry after outages; do not delete metadata first, blindly mark Ready, or purge unknown objects by filename. No automatic reconciliation worker is included. Reconcile restored metadata with bucket contents before restoring traffic.

### Milestone 3 inference configuration

Apply `20261003040000_document_intelligence` before rollout. Configure the complete group below using real Rumpty configuration, never build arguments:

| Variable | Purpose |
| --- | --- |
| `RUMPTY_AI_BASE_URL` | HTTPS API base; include `/v1` if the provider requires it; adapter appends `/chat/completions` |
| `RUMPTY_AI_API_KEY` | Environment-only Bearer credential |
| `RUMPTY_AI_MODEL` | Explicit model identifier; recorded per attempt |

The current adapter assumes OpenAI-compatible chat completions, `response_format: json_object`, system/user messages, `max_tokens`, and `choices[0].message.content` with finish_reason `stop`. This was verified against fixtures, not live Rumpty. Verify the provider contract/context window/JSON support/model availability, then adjust only the adapter if necessary. There is no competing inference provider fallback. Missing AI configuration leaves manual entry usable; core readiness does not invoke paid inference.

Text PDFs use a local parser subprocess included in the standalone image through Next tracing. No extra OS binary or persistent disk is needed. Allow child-process execution and allocate container memory for app plus concurrent parser processes (128 MiB V8 heap limit is not a total RSS cap). Configure a request timeout of at least 90 seconds, bounded concurrency, and per-client ingress limits. Two-minute persisted leases make interrupted attempts retryable; there is no durable background queue. Source content is not sent as a signed storage URL. Bucket credentials now also require server-side GetObject.

Before enabling real-worker inference, test synthetic examples for all four schemas, source grounding, confidence behavior, timeout/invalid-response/manual fallback, and mobile review. Verify Rumpty retention/training/privacy settings and restrict provider logs; do not assume zero retention. Backups containing excerpts/revisions remain sensitive. Live accuracy, capacity, TLS, and inference protocol checks have not been performed by automated fixtures.

### Milestone 4 release notes

Apply `20261003050000_exit_checker` before rolling out the new app. It adds ExitCase and enum types and permits non-document audit actions; existing data is preserved. PostgreSQL 17 was used for migration/drift validation. Exit Checker requires no new secrets, environment variables, provider capabilities, or background process. It works without inference configuration; selecting existing reviewed notice evidence only reads the database. Retain the existing ingress/auth/database protections and verify mobile exit creation/editing plus cross-user isolation on Rumpty before release. No live deployment was performed by repository validation.
