# RumptyCloud deployment and operations

## Current deployment and known limitation

Live application: [treviqo.rumptycloud.app](https://treviqo.rumptycloud.app). The supplied live address is not a claim that every operational acceptance check, backup restore or provider capability has passed. Web and worker are separate processes using RumptyCloud PostgreSQL, Redis, private S3-compatible storage and Rumpty AI for request-driven extraction.

**Direct S3 DeleteObject is currently denied with HTTP 403 AccessDenied in both production and a controlled private test bucket. RumptyCloud support has been contacted.** Manual removal can be reconciled by the implemented verified-absence recovery, but normal deletion remains unresolved. Scheduled account cleanup can remain pending beyond its seven-day eligibility date. Do not broaden credentials, treat a 403 as absence, or finalize database rows without verification. See [current results and troubleshooting](S3_DELETE_AUTHORIZATION_INVESTIGATION.md#current-live-status).

## Runtime topology and environment

Use `runtime` (Next.js web/API), `worker` (Node.js jobs) and `migrate` (Prisma release job) targets in the root [Dockerfile](../../Dockerfile). The default target remains web. Use matching web/worker revisions and configure secrets at runtime, never in Docker build arguments. No separate API service is needed.

[.env.example](../../.env.example) and [environment validation](../../src/server/config/env.ts) define application variable names. Rumpty resource display names are not automatically translated: `S3_BUCKET` is passed directly as the S3 Bucket parameter; obtain the S3 storage identifier from the provider connection settings. Keep internal identifiers out of public documentation/logs.

| Variables                                                    | Use and requirements                                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`, `NEXTAUTH_URL`                                    | Web: matching canonical HTTPS origins in production; worker needs HTTPS APP_URL only                                                   |
| `SESSION_SECRET`                                             | Web auth: private generated secret, minimum 32 characters; no fixture/predictable value in release acceptance                          |
| `DATABASE_URL`                                               | Web, worker and migrations; private PostgreSQL connection, provider-required TLS and bounded pool                                      |
| `REDIS_URL`                                                  | Web and worker; private Redis, persistence/noeviction and required EVAL/sorted-set/TTL access                                          |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`                      | Explicit private storage target; production endpoint uses HTTPS                                                                        |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                   | Static credential pair scoped to the intended bucket/object resources; required by both web and account-cleanup worker                 |
| `S3_FORCE_PATH_STYLE`                                        | `true` default; change only to match verified provider addressing                                                                      |
| `S3_VERSIONING`                                              | `unversioned` default or `versioned`; must reflect actual retained-version behavior, never selected to bypass a denial                 |
| `DOCUMENT_MAX_FILE_MB`                                       | Default 10, allowed integer 1–20 MiB; align ingress body/concurrency limits                                                            |
| `RUMPTY_AI_BASE_URL`, `RUMPTY_AI_API_KEY`, `RUMPTY_AI_MODEL` | Optional complete group on web; base includes `/v1` if required, adapter appends `/chat/completions`; blank group retains manual entry |
| `RUMPTY_AI_TIMEOUT_MS`                                       | Default 60000, range 10000–90000 ms per inference call                                                                                 |
| `WORKER_REQUIRED`                                            | Defaults true in production, false in development/test; false is not accepted by production release preflight                          |
| `PORT`, `HOSTNAME`, `NODE_ENV`                               | Runtime settings: web defaults port 3000; worker health defaults 3001 if PORT is absent                                                |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`          | Local Compose only; not an additional application connection mechanism                                                                 |

Do not share a Redis namespace/database between environments. Web and worker configuration is independent; matching variable names do not prove matching values/principals. Compare them privately during release review. Missing configuration fails closed; health checks do not replace permission tests.

## Build, release and operational checks

See [the ordered release procedure](FIRST_RUMPTY_DEPLOYMENT.md). Apply committed migrations through the migration target without reset or destructive schema push. Production secrets are excluded from the image. Keep the worker always on, with restart policy and monitoring; no inference credentials are needed by its four jobs (`reminders`, `session_cleanup`, `account_cleanup`, `extraction_cleanup`).

Web `/api/health` checks liveness. `/api/ready` checks required database/schema, Redis, auth, bucket connectivity and worker health. Worker `GET /health` reports local in-memory progress and becomes unhealthy when stale. None of these proves DELETE permission, public-access policy, AI availability or backup recoverability.

Operator commands use exported runtime variables; they do not load `.env` automatically:

```sh
npm run worker:build
npm run deployment:check -- --worker
npm run worker:health
```

The preflight command validates configuration; `--services --runtime` additionally contacts configured services and inspects runtime health. Storage/AI mutation probes are explicit operator actions, not routine readiness checks. Use the separate [private-test DELETE probe](S3_DELETE_AUTHORIZATION_INVESTIGATION.md#reviewable-explicit-operator-probe) only with designated test credentials and authorization. Do not rerun failed-cleanup probes casually.

## Inference and storage operations

Current inference uses ordinary chat completions without `response_format`; application schema/grounding checks are authoritative. Eight extraction types are supported. Per-call timing, four-minute attempt/browser bounds, manual fallback and expired-attempt recovery are described in [AI documents](../ai/AI_DOCUMENTS.md#current-implementation). Size ingress request budgets for preparation, up to two inference calls and persistence; a fixed 90-second budget may be insufficient. Never increase timeouts to conceal unresolved provider behavior.

Private S3 operations require distinct read/write/delete permissions. In unversioned mode, purge verifies HEAD/DELETE/HEAD. Versioned mode requires exact-key version inventory/deletion and final absence verification. Retention, backups and downloaded copies require separate policies. Protect original documents from public access independently of application auth. Keep TLS validation enabled and signed query strings out of logs.

## Historical rollout notes

The milestone notes below retain rollout context. Earlier “not deployed”, absent-feature, schema-count and fixture-only statements refer to those dates. The current configuration and four-job contract above take precedence; apply all committed migrations appropriate to the selected release, not just an individual milestone migration.

## Milestone 0 runbook

No Rumpty endpoints, credentials, or deployment project were supplied for the initial implementation. The repository is deployment-ready scaffolding, **not evidence of a live Rumpty deployment**.

1. Provision Rumpty PostgreSQL and Redis on private network endpoints. Use least-privilege application credentials and configure TLS according to Rumpty's connection guidance. Set bounded PostgreSQL connection/pool timeouts and size the pool for the selected compute plan.
2. Provision a private Rumpty S3-compatible bucket. Block public access/ACLs at the provider, restrict credentials to the selected bucket, and configure TLS. The adapter supports HeadBucket, private PutObject, signed GetObject, and DeleteObject; successful readiness does not verify a bucket policy. Confirm privacy independently in Rumpty before storing any documents.
3. Authentication runs in the web app. Set identical canonical `APP_URL` and `NEXTAUTH_URL`. Apply the credentials migration, then use `/register` and `/sign-in`. No identity-service deployment or OIDC client is required. Registration uses Argon2id password hashing; allocate enough memory for 64 MiB per concurrent hashing operation, benchmark latency, and configure ingress concurrency/body limits and per-client throttling before public exposure.
4. Set secrets through Rumpty's secret/environment configuration. Never pass secrets as Docker build arguments. Generate `SESSION_SECRET` using `openssl rand -base64 48` and store its output directly in secret configuration.
5. Build `docker build --target migrate -t treviqo-migrate .` and execute that image as a one-off release job with `DATABASE_URL` injected. It runs `prisma migrate deploy`. Back up existing data before migrations; never use `migrate reset` in production.
6. Build `docker build --target runtime -t treviqo .` and deploy port 3000 behind Rumpty HTTPS ingress. Set the environment variables below. Use `/api/health` for liveness and `/api/ready` for readiness. Add edge request limits to health/readiness/auth routes; the application enforces a global circuit-breaker plus per-email throttling. Keep clocks synchronized for session expiry.
7. Verify a real registration, duplicate-email handling, sign-in, refresh/navigation, `/api/me`, sign-out, invalid/expired session rejection, mobile navigation, private network access, bucket privacy, logs, and a PostgreSQL backup restore. Enable HTTPS/HSTS at ingress. That foundation-only scope is historical; current production readiness includes worker health.

### Implemented runtime variables

| Variables                                  | Purpose                                                         |
| ------------------------------------------ | --------------------------------------------------------------- |
| `APP_URL`, `NEXTAUTH_URL`                  | Identical canonical app origin; HTTPS in production             |
| `SESSION_SECRET`                           | At least 32 characters of generated entropy; encrypts sessions  |
| `DATABASE_URL`                             | Rumpty PostgreSQL connection string                             |
| `REDIS_URL`                                | Rumpty Redis connection string                                  |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`    | Explicit Rumpty object-storage location                         |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Least-privilege bucket credentials                              |
| `DOCUMENT_MAX_FILE_MB`                     | Upload limit in MiB; default 10, integer 1–20                   |
| `S3_FORCE_PATH_STYLE`                      | `true` by default; change only to match Rumpty endpoint support |

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

Recovery: monitor stale Uploaded/Processing rows older than 15 minutes, Failed rows, and Deleting rows. Confirm the upload process is no longer running; have the owner retry removal from the detail page, or run an authenticated/operator-controlled reconciliation using the same deletion service. The durable key enables cleanup even after an ambiguous PUT or database commit. Retry after outages; do not delete metadata first, blindly mark Ready, or purge unknown objects by filename. Active-account single-document cleanup requires an owner-authorized retry; scheduled account cleanup uses the worker. Reconcile restored metadata with bucket contents before restoring traffic.

### Milestone 3 inference configuration

Apply `20261003040000_document_intelligence` before rollout. Configure the complete group below using real Rumpty configuration, never build arguments:

| Variable             | Purpose                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `RUMPTY_AI_BASE_URL` | HTTPS API base; include `/v1` if the provider requires it; adapter appends `/chat/completions` |
| `RUMPTY_AI_API_KEY`  | Environment-only Bearer credential                                                             |
| `RUMPTY_AI_MODEL`    | Explicit model identifier; recorded per attempt                                                |

The adapter uses OpenAI-compatible chat completions, system/user messages, `max_tokens`, and `choices[0].message.content` with finish_reason `stop`; it does not send `response_format`. This was verified against fixtures, not live Rumpty. Verify the provider contract/context window/JSON support/model availability, then adjust only the adapter if necessary. There is no competing inference provider fallback. Missing AI configuration leaves manual entry usable; core readiness does not invoke paid inference.

Text PDFs use a local parser subprocess included in the standalone image through Next tracing. No extra OS binary or persistent disk is needed. Allow child-process execution and allocate container memory for app plus concurrent parser processes (128 MiB V8 heap limit is not a total RSS cap). Configure ingress budgets for the current bounded extraction workflow, bounded concurrency and per-client limits. Four-minute attempts make interruptions recoverable; the worker reaps expired attempts, while inference itself is request-driven. Source content is not sent as a signed storage URL. Bucket credentials now also require server-side GetObject.

Before enabling real-worker inference, test synthetic examples for all eight supported extraction schemas, source grounding, confidence behavior, timeout/invalid-response/manual fallback, and mobile review. Verify Rumpty retention/training/privacy settings and restrict provider logs; do not assume zero retention. Backups containing excerpts/revisions remain sensitive. Live accuracy, capacity, TLS, and inference protocol checks have not been performed by automated fixtures.

### Milestone 4 release notes

Apply `20261003050000_exit_checker` before rolling out the new app. It adds ExitCase and enum types and permits non-document audit actions; existing data is preserved. PostgreSQL 17 was used for migration/drift validation. Exit Checker requires no new secrets, environment variables, provider capabilities, or background process. It works without inference configuration; selecting existing reviewed notice evidence only reads the database. Retain the existing ingress/auth/database protections and verify mobile exit creation/editing plus cross-user isolation on Rumpty before release. No live deployment was performed by repository validation.

### Milestone 5 release notes

Apply `20261003060000_settlement_pension` using the migration target before rolling out the new runtime. It adds owned finance records and audit actions without resetting existing data. No new dependencies, secrets, environment variables or background workers are required. Existing optional Rumpty inference variables enable both new schemas; manual entry remains available.

Validate all eight extraction types with synthetic evidence on the real Rumpty model, especially separate contribution periods/posting dates, employee/employer amounts, three-entry limits and schema adherence. Confirm private storage, ingress concurrency/body limits, TLS, backup/restore and worker isolation before release. Saved follow-up dates drive in-app reminders through the worker; they do not send external notifications. Local Docker validation is not a live deployment.

### Milestone 6 release notes

Apply additive migration `20261004000000_benefit_passport` before deploying the runtime. It adds Benefit assessment enums/table and audit metadata; Passport entries themselves derive from original closed employments and need no backfill or generation job. No new environment variables, dependencies, provider services or background processes are introduced.

Validate own/foreign/anonymous Passport access, source deletion/revision, reopened employment, masked identifiers and narrow-screen navigation on Rumpty before release. Existing private storage, TLS, database backups and ingress requirements remain. Benefit assessments are worker judgements against evidence, not provider verification. The reminder scheduler is implemented; Passport export is not.

## Milestone 7 worker and recovery runbook

Historical Milestone 5/6 notes above describe saved dates before scheduling existed. Milestone 7 now schedules **in-app** reminders, never external notifications.

### Worker release and monitoring

1. Build explicit targets: `docker build --target runtime -t treviqo-web .`, `docker build --target worker -t treviqo-worker .`, and `docker build --target migrate -t treviqo-migrate .`. Run the migration release job against Rumpty PostgreSQL before starting the new versions. The default Docker target remains web.
2. Run worker as an always-on, non-public Rumpty process using its image CMD. Configure private PostgreSQL and Redis URLs, a production HTTPS APP_URL, TLS trust and bounded database pools. S3 credentials are required by scheduled account deletion; AI credentials are not needed. See the current worker deployment section below. Use least privilege, persistent/noeviction Redis settings, a restart policy and at least a 90-second health start grace. Allow more than 10 seconds for shutdown; interrupted work is recovered through the two-minute job lease.
3. Run `npm run worker:health` or the image health command. Alert on missing heartbeat, attempts >=5, oldest due job >5 minutes, no completed sweep within two hours, database/Redis failures and failed container health. Inspect only BackgroundJob IDs, cursor, attempts and generic errorCode; never log document payloads or connection strings. Fix poisoned evidence/code/configuration and allow retry; do not delete domain records to unblock a batch.
4. Keep production `WORKER_REQUIRED=true` (default); false is only a deliberate degraded/manual operating mode. Configure load balancer readiness at `/api/ready` and process liveness at `/api/health`. A worker outage affects readiness while liveness stays available. Do not restart a healthy web process merely for external dependency failure.
5. Redis queue loss repairs itself from PostgreSQL, but rate-limit counters do not. Configure ingress rate/concurrency/body limits and Redis persistence. Test restart, network interruption, TLS and realistic job volume on Rumpty before release. No live AI calls are made by readiness or worker ticks.

### Backup/snapshot readiness and restoration

These are required production configuration/acceptance steps, **not a claim that Rumpty backups are already enabled or restored**. Agree RPO/RTO with the selected Rumpty plan; proposed MVP targets are RPO <=24 hours and RTO <=4 hours, to be measured in a drill. Use Rumpty encrypted scheduled PostgreSQL backups (PITR if supported), private object snapshots/versioning and a coordinated retention window (initial proposal: 30 days), limited operator access and restore monitoring. Include structured evidence, review history and audits; store deployment secrets separately in approved secret configuration. Verify what Rumpty actually supports before adopting these targets.

Restore drill:

1. Record backup timestamps, application version and migration version. Restore into isolated Rumpty PostgreSQL and a **private** bucket with separate credentials; do not overwrite production to test recovery. Disable public routing and stop workers/writes during recovery.
2. Restore database and compatible object snapshot. Apply committed migrations with the release image. Reconcile object metadata against available versions; absent bytes must remain unavailable, never replaced with fabricated evidence. Review retention/deletion implications of restoring previously deleted objects and purge them according to the agreed retention policy.
3. Revoke restored authentication sessions (`DELETE FROM "AuthSession"`) before serving users. Rotate session secrets where appropriate. Reset the four configured BackgroundJob rows (`reminders`, `session_cleanup`, `account_cleanup`, `extraction_cleanup`) to pending, clear leaseToken/leaseUntil/cursor, set attempts=0, lastSucceededAt=NULL, createdAt/dueAt/updatedAt to now; this restarts a complete reminder sweep. Preserve Reminder rows so saved snoozes/dismissals survive.
4. Delete only `treviqo:jobs:due` and `treviqo:worker:heartbeat` in the isolated Redis namespace. Never use FLUSHALL against a shared service. Start worker, verify completed sweeps for all four configured jobs and health, then start web. Restored reminders independently revalidate current evidence.
5. Verify migration drift, login/logout/revocation, own/foreign access, private signed document download/anonymous denial, source deletion, reminder reconciliation and readiness. Confirm stale evidence does not retain trusted confirmation. Record measured data loss/recovery duration and operator sign-off before any traffic cutover.

Redis is not the backup of record for reminders. Audit retention and document deletion policy still require product/operator decisions; no automatic audit purge is included. Keep backups containing sensitive evidence private and restrict their lifetime/access.

## First production-like release

Follow [the ordered deployment and live acceptance procedure](FIRST_RUMPTY_DEPLOYMENT.md). It separates configuration, safe migrations, synthetic storage/AI probes and real HTTPS/worker acceptance from fixture-only smoke tests. Live services remain unverified until credentials and target access are supplied.

## First live verification

[Live integration report](LIVE_RUMPTY_VERIFICATION.md): S3 upload/read/signing and AI authentication/model discovery verified; private database/Redis access, S3 deletion/expiry behavior and inference completion remain blockers. That October 4 report predates the current live application; use it as historical evidence only.

## Deployment blocker follow-up

See [private-network execution, S3/AI diagnosis and manual backup fallback](RUMPTY_BLOCKERS.md) for historical results and private-network context; use the [current deployment guidance](RUMPTY_DEPLOYMENT.md#current-deployment-and-known-limitation) for present status. Internal PostgreSQL/Redis DNS is expected to require a Rumpty-hosted workload; no public access is needed.

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

## Worker deployment when Rumpty cannot select Docker targets

The root Dockerfile still ends with `FROM runtime AS default`, so the normal
branch continues to deploy the web application. The existing `worker` target
contains production dependencies (including the generated Prisma client/runtime),
`dist-worker`, the Prisma schema/migrations, and deployment-check fixtures. Build
output remains ignored by Git and Docker; it is generated inside the build stage.

Create a separate branch **after the source changes have been reviewed and committed**.
Use the same source revision as the web release. These commands are operator steps,
not something the application runs:

```sh
git switch -c deploy/worker <web-release-commit>
python3 - <<'PY'
from pathlib import Path
path = Path('Dockerfile')
text = path.read_text()
assert text.count('FROM runtime AS default') == 1
path.write_text(text.replace('FROM runtime AS default', 'FROM worker AS default'))
PY
git diff -- Dockerfile
git add Dockerfile
git commit -m "Select worker as Rumpty default Docker target"
git push -u origin deploy/worker
```

Connect a second Rumpty deployment to `deploy/worker`. Use its normal Docker build,
without a command override. Set its HTTP health-check path to `/health`. Configure
always-on execution (at least one worker instance); do not use scale-to-zero. Give
startup health checks a 90-second grace period, matching the Docker worker check,
and shutdown a grace period longer than 10 seconds. Future releases must update
this branch from the matching web revision while retaining only this one-line
Dockerfile stage difference. Do not merge the worker stage selection into main.

The continuous worker listens on `0.0.0.0:$PORT`, or port `3001` if `PORT` is absent.
Only `GET /health` is supported. It returns minimal, non-cacheable JSON with HTTP
200 (`{"status":"ok"}`) or 503 (`{"status":"unhealthy"}`). Startup is unhealthy
until the first successful tick and existing heartbeat/job-health check. Requests
read an in-memory snapshot; they never query services or run jobs. A snapshot
expires after 45 seconds without healthy local progress, even if a different
worker continues updating the shared heartbeat. Other methods/paths return 404.

SIGTERM/SIGINT stop HTTP immediately, interrupt the loop's wait, allow an in-flight
tick to finish, and disconnect Redis/Prisma. A 10-second deadline forces a nonzero
exit if an unabortable dependency call or cleanup stalls; durable job leases recover
on restart. `--once` remains HTTP-free. `npm run worker:health` remains the existing
independent heartbeat/durable-job CLI probe and Docker health check.

Required worker environment:

- `NODE_ENV=production`, `APP_URL=<canonical HTTPS web URL>`
- `DATABASE_URL`, `REDIS_URL` pointing to the same services as the web deployment
- `PORT` injected by Rumpty (no need to hardcode it)
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
  for the existing account-cleanup job, which purges private documents before
  deleting accounts; match the web bucket and appropriate deletion permissions
- `S3_VERSIONING` and `S3_FORCE_PATH_STYLE` if the bucket requires non-default values

No `SESSION_SECRET`, `NEXTAUTH_URL`, or AI variables are required. The core loop can
start with database/Redis only, but document-bearing account deletion cannot finish
without storage; production worker deployment preflight therefore requires S3.
Run `npm run deployment:check -- --worker` with those variables to validate config,
and add `--services --runtime` to check database/Redis and job health. Storage
permissions/versioning still require the existing private-bucket acceptance checks.

## Direct S3 DELETE authorization investigation

For an operation-by-operation audit and an explicitly invoked disposable-object
probe, see [S3 DELETE authorization investigation](S3_DELETE_AUTHORIZATION_INVESTIGATION.md).
The probe uses separate confirmed `PROBE_*` configuration and does not run in the
worker loop. Test-bucket success does not establish production-bucket permissions;
a production disposable probe requires separate authorization. Never use a 403 as
proof of object absence.

## Diagnosing database and worker readiness — 20 October 2026

Observed operator evidence: web `readiness_failed database,worker` at 04:25:33 and 04:38:26, repeated worker-only readiness failures, and worker `Worker dependencies unavailable; retrying.` at 04:26:13. These are supplied log times; their timezone and instance correlation have not been independently established. They do not establish a common cause with S3 DELETE authorization. No production inspection or restart was performed in this investigation.

### What each signal means

- Web `/api/health` reports process liveness only; it can be 200 throughout an infrastructure outage.
- Web readiness runs database, Redis, storage, worker and auth checks concurrently, each with a three-second deadline. `database` means one of the sequential User/Reminder/BackgroundJob reads failed or the whole database check exceeded that deadline. It does not distinguish connectivity, pool contention, missing schema or slow queries by itself. Deadline expiry does not cancel the underlying query.
- `worker` is required by default in production unless explicitly overridden. It can mean the worker-health check returned false, threw on Redis/database access, or exceeded the readiness deadline. Repeated worker-only failures mean that readiness invocation's other checks passed; they do not prove a healthy database history.
- The worker retry message means `tick()` or its subsequent health check threw. A tick starts with Redis PING, initializes/reclaims/reads durable jobs in PostgreSQL, repairs the Redis due queue, claims at most one job, processes it and publishes a heartbeat. Failure before heartbeat publication can eventually expire the shared heartbeat.
- A processing or success-checkpoint failure is caught inside the job runner, logged, and rescheduled with a lease-token/state condition. If retry persistence succeeds, the tick can still publish a heartbeat. If retry persistence fails, the error escapes to the runtime. A fresh heartbeat is therefore not sufficient proof of completed jobs.
- Shared health requires a finite heartbeat no more than five seconds in the future and no more than 45 seconds old, all four configured job rows, fewer than five attempts each, due dates less than five minutes overdue, and a completed sweep within two hours. A never-completed job has a two-minute startup allowance. Redis expires the heartbeat key after 45 seconds; a missing key fails health at real-world timestamps.
- Worker HTTP `/health` reads only its own in-memory snapshot. Startup is unhealthy until a tick and shared health check both succeed. A failed tick/check clears the snapshot; a hung tick/check can leave the previous snapshot until it becomes 45 seconds old. Clock rollback also fails local health. HTTP does not execute work or query dependencies and cannot borrow another instance's healthy snapshot.

Ticks wait ten seconds after completing/failing; this is not a ten-second execution deadline. Completed sweeps recur after 60 seconds; additional batches are immediately due for a later tick. Failed jobs back off from ten seconds to thirty minutes. Expired two-minute leases are reclaimed on a subsequent successful tick and increment attempts. Five failures make health false but do not permanently disable retries. Do not clear attempts, leases, job rows or Redis to make health appear green.

PostgreSQL uses one lazily created Prisma client per process, with provider logging disabled. Connection/pool settings come from the runtime `DATABASE_URL`; no application-wide transaction override is configured. Reminder reconciliation uses serializable interactive transactions with Prisma defaults; account cleanup includes separately bounded transactions. Connection failures, pool timeouts, transaction expiry and serialization conflicts can therefore occur at different stages. Redis uses lazy connection, a two-second connection timeout, 2.5-second command timeout, one retry per request and no automatic reconnect strategy; a client in `end` state is recreated on a subsequent `getRedis()` call.

### Safe diagnostics added by this investigation

These diagnostics exist in source and require a future authorized deployment before they can appear in production. Existing summary logs and public health response bodies are preserved.

- `runtime_failed operation=readiness_database category=...` distinguishes the failed readiness check and an allowlisted category.
- `runtime_failed operation=worker_database|worker_redis category=...` identifies the failing tick/shared-health dependency boundary.
- `runtime_failed operation=worker_job category=...` and `worker_job_failed job=...` identify a caught processing/checkpoint failure. Only the four fixed scheduled-job names are emitted, never a record ID or cursor.
- `runtime_failed operation=worker_tick|worker_health category=...` distinguishes exceptions from the runtime's two phases.
- `worker_health_failed reason=...` distinguishes invalid/future/expired heartbeats, missing jobs, retry thresholds, overdue jobs, stale sweeps and jobs that never completed.

Categories include database connectivity/authentication/schema/pool-timeout/transaction/conflict, DNS, refused/reset connections and readiness deadlines. Unrecognized errors remain `unknown`; Redis protocol errors use `redis_command`. No error-message parsing, raw error codes, messages, stacks, provider payloads, connection URLs, credentials or user data are logged. Categories narrow the investigation; they cannot prove a provider outage or explain every error. A permanently stuck operation may not emit a failure until it rejects; inspect snapshot/heartbeat age as well.

### Exact read-only production verification

1. In Rumpty, inspect **both** service configurations and all running instances privately. Confirm matching intended PostgreSQL database and Redis service/namespace, current release, startup command, runtime secret version and instance start time. Compare values privately; report only matches, timestamps and status. A local `.env` or Git revision does not prove deployed configuration. Do not print environment dumps. Both processes cache clients; configuration changes do not update an already running process automatically.
2. Confirm web ingress probes `/api/health` and `/api/ready`, worker probes `/health`, the injected port matches the listener, the worker is always on, startup grace is at least 90 seconds and shutdown grace exceeds ten seconds. Do not change these settings during this inspection. Correlate logs by instance and normalized timezone, including restarts, memory/CPU pressure and provider database connection limits.
3. From each service's network context, use the provider's private SQL console/read-only connection to run `SELECT 1;`, then the query below. Apply a session-local three-second statement timeout in the read-only transaction. Report success, elapsed time and safe error category only; never copy raw database errors containing connection or query details. Do not run migrations or job ticks.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '3s';
SELECT 1;
SELECT 1 FROM "User" LIMIT 1;
SELECT 1 FROM "Reminder" LIMIT 1;
SELECT "id", "state", "attempts", "dueAt", "createdAt", "lastSucceededAt",
       "leaseUntil",
       CASE WHEN "errorCode" IN ('job_failed', 'lease_expired')
            THEN "errorCode" ELSE NULL END AS "safeErrorCode"
FROM "BackgroundJob"
WHERE "id" IN ('reminders', 'session_cleanup', 'account_cleanup', 'extraction_cleanup');
COMMIT;
```

4. Using an authenticated private Redis console for that same configured service, run only the following read commands. Report PING status, TTL and computed heartbeat age, never connection details. Compare the heartbeat milliseconds with current UTC epoch milliseconds. Repeat after at least one normal tick interval without changing the queue.

```text
PING
TTL treviqo:worker:heartbeat
GET treviqo:worker:heartbeat
ZCARD treviqo:jobs:due
```

5. Compare all four jobs' attempt counts, due times, lease expiry and last completed sweeps with the thresholds above. Readiness can fail while Redis PING and `SELECT 1` succeed: those checks do not establish application table access, transaction capacity or completed jobs. Inspect migration status and provider connection/pool/lock metrics privately if needed, without collecting query texts or user rows. A SQL console success is only a control unless it uses the same role and network as the affected runtime.
6. Collect the next safe diagnostic categories after a separately authorized release, or ask the operator/provider for equivalent read-only evidence now. Do not run `worker --once`, `deployment:check --services`, cleanup, queue resets or test suites against production: some of those commands perform writes. Keep S3 authorization findings separate unless a failing account-cleanup operation explicitly identifies storage; per-account cleanup can catch/retry storage failures without failing the entire scheduled sweep.
