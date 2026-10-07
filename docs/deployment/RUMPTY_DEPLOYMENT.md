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

### Milestone 5 release notes

Apply `20261003060000_settlement_pension` using the migration target before rolling out the new runtime. It adds owned finance records and audit actions without resetting existing data. No new dependencies, secrets, environment variables or background workers are required. Existing optional Rumpty inference variables enable both new schemas; manual entry remains available.

Validate all six extraction types with synthetic evidence on the real Rumpty model, especially separate contribution periods/posting dates, employee/employer amounts, three-entry limits and schema adherence. Confirm private storage, ingress concurrency/body limits, TLS, backup/restore and worker isolation before release. Saved follow-up dates do not schedule jobs or send notifications. Local Docker validation is not a live deployment.

### Milestone 6 release notes

Apply additive migration `20261004000000_benefit_passport` before deploying the runtime. It adds Benefit assessment enums/table and audit metadata; Passport entries themselves derive from original closed employments and need no backfill or generation job. No new environment variables, dependencies, provider services or background processes are introduced.

Validate own/foreign/anonymous Passport access, source deletion/revision, reopened employment, masked identifiers and narrow-screen navigation on Rumpty before release. Existing private storage, TLS, database backups and ingress requirements remain. Benefit assessments are worker judgements against evidence, not provider verification. No reminder scheduler or export job is enabled.

## Milestone 7 worker and recovery runbook

Historical Milestone 5/6 notes above describe saved dates before scheduling existed. Milestone 7 now schedules **in-app** reminders, never external notifications.

### Worker release and monitoring

1. Build explicit targets: `docker build --target runtime -t treviqo-web .`, `docker build --target worker -t treviqo-worker .`, and `docker build --target migrate -t treviqo-migrate .`. Run the migration release job against Rumpty PostgreSQL before starting the new versions. The default Docker target remains web.
2. Run worker as an always-on, non-public Rumpty process using its image CMD. Configure private PostgreSQL and Redis URLs, a production HTTPS APP_URL, TLS trust and bounded database pools. No S3/AI credentials are needed by the worker itself. Use least privilege, persistent/noeviction Redis settings, a restart policy and at least a 90-second health start grace. Allow shutdown long enough for an in-flight bounded batch (two-minute lease); interrupted work is retried.
3. Run `npm run worker:health` or the image health command. Alert on missing heartbeat, attempts >=5, oldest due job >5 minutes, no completed sweep within two hours, database/Redis failures and failed container health. Inspect only BackgroundJob IDs, cursor, attempts and generic errorCode; never log document payloads or connection strings. Fix poisoned evidence/code/configuration and allow retry; do not delete domain records to unblock a batch.
4. Keep production `WORKER_REQUIRED=true` (default); false is only a deliberate degraded/manual operating mode. Configure load balancer readiness at `/api/ready` and process liveness at `/api/health`. A worker outage affects readiness while liveness stays available. Do not restart a healthy web process merely for external dependency failure.
5. Redis queue loss repairs itself from PostgreSQL, but rate-limit counters do not. Configure ingress rate/concurrency/body limits and Redis persistence. Test restart, network interruption, TLS and realistic job volume on Rumpty before release. No live AI calls are made by readiness or worker ticks.

### Backup/snapshot readiness and restoration

These are required production configuration/acceptance steps, **not a claim that Rumpty backups are already enabled or restored**. Agree RPO/RTO with the selected Rumpty plan; proposed MVP targets are RPO <=24 hours and RTO <=4 hours, to be measured in a drill. Use Rumpty encrypted scheduled PostgreSQL backups (PITR if supported), private object snapshots/versioning and a coordinated retention window (initial proposal: 30 days), limited operator access and restore monitoring. Include structured evidence, review history and audits; store deployment secrets separately in approved secret configuration. Verify what Rumpty actually supports before adopting these targets.

Restore drill:

1. Record backup timestamps, application version and migration version. Restore into isolated Rumpty PostgreSQL and a **private** bucket with separate credentials; do not overwrite production to test recovery. Disable public routing and stop workers/writes during recovery.
2. Restore database and compatible object snapshot. Apply committed migrations with the release image. Reconcile object metadata against available versions; absent bytes must remain unavailable, never replaced with fabricated evidence. Review retention/deletion implications of restoring previously deleted objects and purge them according to the agreed retention policy.
3. Revoke restored authentication sessions (`DELETE FROM "AuthSession"`) before serving users. Rotate session secrets where appropriate. Reset the two BackgroundJob rows to pending, clear leaseToken/leaseUntil/cursor, set attempts=0, lastSucceededAt=NULL, createdAt/dueAt/updatedAt to now; this restarts a complete reminder sweep. Preserve Reminder rows so saved snoozes/dismissals survive.
4. Delete only `treviqo:jobs:due` and `treviqo:worker:heartbeat` in the isolated Redis namespace. Never use FLUSHALL against a shared service. Start worker, verify both completed jobs and health, then start web. Restored reminders independently revalidate current evidence.
5. Verify migration drift, login/logout/revocation, own/foreign access, private signed document download/anonymous denial, source deletion, reminder reconciliation and readiness. Confirm stale evidence does not retain trusted confirmation. Record measured data loss/recovery duration and operator sign-off before any traffic cutover.

Redis is not the backup of record for reminders. Audit retention and document deletion policy still require product/operator decisions; no automatic audit purge is included. Keep backups containing sensitive evidence private and restrict their lifetime/access.

## First production-like release

Follow [the ordered deployment and live acceptance procedure](FIRST_RUMPTY_DEPLOYMENT.md). It separates configuration, safe migrations, synthetic storage/AI probes and real HTTPS/worker acceptance from fixture-only smoke tests. Live services remain unverified until credentials and target access are supplied.

## First live verification

[Live integration report](LIVE_RUMPTY_VERIFICATION.md): S3 upload/read/signing and AI authentication/model discovery verified; private database/Redis access, S3 deletion/expiry behavior and inference completion remain blockers. No live migration or deployment has occurred.

## Deployment blocker follow-up

See [private-network execution, S3/AI diagnosis and manual backup fallback](RUMPTY_BLOCKERS.md) for current results and operator steps. Internal PostgreSQL/Redis DNS is expected to require a Rumpty-hosted workload; no public access is needed.

### Scheduled deletion rollout

Apply `20261007020000_scheduled_account_deletion` only in an explicitly authorized
rollout; release the matching web and worker artifacts together. The worker's
`account_cleanup` job must run for scheduled deletion to finish. Monitor overdue
accounts, retry dates/counters and global job health. Legacy partially deleted
accounts become immediately due and remain non-cancellable.

Configure `S3_VERSIONING` after verifying the bucket mode with Rumpty. Default
`unversioned` uses HEAD/DELETE/HEAD without version enumeration; `versioned`
requires exact-version listing/deletion support and permissions. Do not configure
unversioned mode for a bucket retaining historical versions. Local fixtures do not
establish live Rumpty versioning or retention behavior. See the
[deletion specification](../security/ACCOUNT_DELETION.md).
