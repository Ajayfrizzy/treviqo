# First Rumpty production-like deployment

Status update: first live checks partially connected S3 and AI model discovery; deployment acceptance is blocked. See [live verification results](LIVE_RUMPTY_VERIFICATION.md). The preparation record below is historical. No Rumpty credentials, endpoints, target project, console/CLI access or backup evidence were present in the workspace/process environment on 4 October 2026. Local fixture results are not evidence of live provider compatibility. Milestone 8 product features are out of scope.

## Release artifacts and configuration

Use the current working tree, including the Milestones 5–7 changes, as the release candidate. Do not accidentally build only the older committed revision. No commit/push is performed here. Keep auto-deployment disabled until an explicitly selected revision/image includes the full candidate. Record the deployed image digests in the acceptance record.

Existing architecture remains web + worker + migration release job, with Rumpty PostgreSQL, Redis, private S3-compatible storage and AI. No new dependency/provider is added. `src/server/config/deployment.ts` is an explicit release preflight separate from credential-free build validation; `src/ops/deployment.ts` reuses the application adapters for bounded synthetic probes. It is an operator CLI, never a public HTTP endpoint. Worker image contains this CLI, migrations and synthetic AI fixtures.

| Process | Required configuration |
| --- | --- |
| Web | NODE_ENV=production; APP_URL/NEXTAUTH_URL identical canonical HTTPS origin; generated SESSION_SECRET; DATABASE_URL; REDIS_URL; all five S3 variables; WORKER_REQUIRED=true |
| Worker | NODE_ENV=production; APP_URL canonical HTTPS origin; DATABASE_URL; REDIS_URL. No session/storage/AI secrets required. |
| Migration release job | DATABASE_URL for the selected target database, using a direct migration-capable connection. |
| Operator probes | Web configuration for full checks; complete AI group for `--ai`. Uses same trust/network access as the application. |

AI group: `RUMPTY_AI_BASE_URL`, `RUMPTY_AI_API_KEY`, `RUMPTY_AI_MODEL`. Base URL must be the actual Rumpty API base (including `/v1` if required), not the complete `/chat/completions` path. The existing adapter appends that path. `S3_FORCE_PATH_STYLE=true` is the default; change only per actual endpoint guidance. Keep DOCUMENT_MAX_FILE_MB within 1–20 (default 10).

Use Rumpty's secret/environment controls. For a local operator session, create an ignored `.env.production.local` from `.env.example`, set NODE_ENV=production, restrict permissions with `chmod 600 .env.production.local`, and fill real values in your editor. Generate SESSION_SECRET with a cryptographically random generator (48 random bytes recommended), directly into secret configuration; never put values into chat, shell command arguments, build args or tracked files. `.env*` files are excluded from Git and Docker contexts. Docker env files use unquoted `KEY=value` entries; do not blindly source them as shell code. Avoid `docker inspect` environment dumps and shell tracing.

APP_URL must contain no path/query/fragment/user credentials. PostgreSQL and Redis URLs must identify real services; URL-encode credential components. Use Rumpty's documented TLS modes/trust material, `rediss://` where TLS is offered, and private network endpoints. Do not disable certificate verification. If Rumpty supplies a custom CA, mount it read-only and set NODE_EXTRA_CA_CERTS for Node Redis/S3/AI clients; Prisma/PostgreSQL certificate configuration must follow its connector's separate TLS settings. Use actual provider guidance rather than invented certificate paths or region/model names. Recommended PostgreSQL connection parameters include bounded `connection_limit`, `connect_timeout` and `pool_timeout`, sized across web, worker and operator processes.

## Rumpty console steps still required

1. Select the target project/environment and region. Confirm whether its PostgreSQL database is empty or existing. Provision/identify PostgreSQL, Redis, bucket, inference model, web compute and **always-on** worker compute. Capture real service endpoints/credentials in secret controls. Private endpoints may require running probes from Rumpty compute rather than a laptop.
2. Configure PostgreSQL backups/PITR if supported, retention and a pre-release snapshot for any existing database. Verify migration and runtime role privileges. Confirm Redis persistence/noeviction, authentication, ACL support for EVAL/sorted sets/TTL and networking. Do not share a Redis database/namespace with another Treviqo environment.
3. Block public bucket policies/ACLs. App permissions are HeadBucket, private PutObject, GetObject, DeleteObject and signed response headers for the intended bucket. The synthetic probe uses `deployment-probes/<random UUID>.txt`; permit that prefix for the operator or use a dedicated acceptance bucket with the same policy. The download endpoint must be reachable by users' browsers. Check bucket versioning/lifecycle and retained versions; deletion of the current key is not erasure of backups/versions.
4. Verify inference API protocol, available model identifier, context/output limits, credits, privacy/training/retention and log settings. No alternative provider fallback exists.
5. Configure web HTTPS ingress/DNS, port 3000, request timeout >=90 seconds for extraction, body limits consistent with upload settings, bounded upload/parser/auth concurrency, per-client ingress limits and redacted logs. Each Argon2 operation uses 64 MiB; PDF subprocess heap cap is 128 MiB, not total RSS. Measure memory/capacity before opening real-worker access.
6. Configure worker restart policy, >=90-second health startup grace and up to two-minute graceful shutdown. Worker has no public port. Configure monitoring for heartbeat, failed jobs, readiness and database/storage errors.
7. Configure encrypted backups/object snapshots, restricted operators, retention and a restore drill. See the [existing recovery runbook](RUMPTY_DEPLOYMENT.md#milestone-7-worker-and-recovery-runbook). Record actual snapshot/restore evidence before acceptance; repository code cannot enable or prove console backup settings.

Exact Rumpty menu names, image registry and build-target controls require the real console/account. No unsupported CLI or manifest format is invented here.

## Build and preflight

Run locally with Node 22 and disposable test service URLs, never against the live database:

```sh
npm ci
npm run validate
npm run test:integration
npm run test:e2e

docker build --target runtime -t treviqo-web:candidate .
docker build --target worker -t treviqo-worker:candidate .
docker build --target migrate -t treviqo-migrate:candidate .
```

Push/upload artifacts only when explicitly authorized, or select equivalent Rumpty builds for the approved repository revision. Never supply production secrets at build time. Deploy the web and worker from the same candidate. The default Docker target remains web.

Configuration-only preflight (no network calls):

```sh
node --env-file=.env.production.local --conditions=react-server dist-worker/ops/deployment.js
# Or with the operator image, on a host able to reach the Rumpty network:
docker run --rm --env-file .env.production.local treviqo-worker:candidate npm run deployment:check
```

Worker-specific preflight accepts a minimal worker env file and `--worker`. CLI output includes safe check names/counts, never connection strings, credentials, source text, model responses or signed URLs. Nonzero exit means release acceptance has failed. A generated-secret heuristic rejects common fixtures/repeated strings but does not prove entropy: generate the secret securely.

## Safe migration procedure

1. Verify project/database identity privately in the Rumpty console. For existing data, obtain a completed backup/snapshot and test restore access before applying changes. Keep old app/worker stopped during first deployment or follow a reviewed compatibility rollout.
2. Review the nine committed SQL migrations. Run the migration image with the selected target's environment:

```sh
docker run --rm --env-file .env.production.local treviqo-migrate:candidate npx prisma migrate status
# Pending migrations on a new database are expected; other errors require investigation.
docker run --rm --env-file .env.production.local treviqo-migrate:candidate npm run db:deploy
docker run --rm --env-file .env.production.local treviqo-migrate:candidate npx prisma migrate status
# Reads configured datasource; avoids putting its URL into command arguments.
docker run --rm --env-file .env.production.local treviqo-migrate:candidate npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Use `migrate deploy`, never `migrate dev`, `db push` or `migrate reset` on live data. If a nonempty target lacks expected migration history, stop and determine an explicit baseline; do not mark migrations applied by guesswork. On a failed migration, inspect/repair using Prisma's documented recovery process; do not automatically resolve or reset. Roll back application images only when schema-compatible; restore data only through an approved recovery plan.

After migration:

```sh
docker run --rm --env-file .env.production.local treviqo-worker:candidate npm run deployment:check -- --services
```

This reads PostgreSQL migration history and checks names/checksums/completion against this candidate, tests Redis using one random 30-second TTL key then deletes it, and checks bucket connectivity. It does not migrate, scan user data, run jobs or prove bucket privacy. Schema drift remains the separate Prisma command above.

## Controlled live probes

Once real configuration is available, run from the intended Rumpty network. Only synthetic content is used; no real worker documents are needed.

```sh
docker run --rm --env-file .env.production.local treviqo-worker:candidate npm run deployment:check -- --storage
docker run --rm --env-file .env.production.local treviqo-worker:candidate npm run deployment:check -- --ai
```

Storage creates one random synthetic object, tests SDK read, signed download/attachment, unsigned denial, tampered-signature denial, two-second link expiry, deletion and denial after deletion. Cleanup runs even after a partial failure; output includes only a probe UUID to locate `deployment-probes/<UUID>.txt` if network failure prevents cleanup. Retained versions need provider lifecycle cleanup. A passing single-object probe does not prove all bucket policies or cross-user app authorization; inspect policies and perform the app checks below. Never use a public bucket to make a failing probe pass.

AI performs at most 12 calls (classification + extraction for each of six types), no automatic retries, with current prompts/schema and grounded parsers. Reports only type, expected-value coverage and latency; strict acceptance may fail on missing/low-confidence/semantically different values despite valid protocol. Investigate the model/adapter using synthetic examples, retaining manual review; never weaken grounding/confirmation to force a pass. Fixture tests do not prove model accuracy. The probe does not write trusted fields or make legal/workflow decisions.

## Start services and verify runtime

Start the worker image with its default CMD in Rumpty; start web with its default CMD behind configured HTTPS ingress. In the worker container run `npm run worker:health`. From the operator image:

```sh
docker run --rm --env-file .env.production.local treviqo-worker:candidate npm run deployment:check -- --runtime
```

This checks worker heartbeat/progress and actual canonical HTTPS `/api/health` and `/api/ready`. Readiness requires PostgreSQL/new tables, Redis, bucket, auth configuration and healthy worker. It does not call AI. Liveness remains independent. Do not probe the public HTTPS app by silently substituting local HTTP: TLS/ingress must be verified.

In the isolated production-like environment, register two synthetic worker accounts through the deployed UI. Verify login/logout and copied-cookie revocation; create employment/exit records, upload synthetic documents, confirm/correct/reject extractions, and exercise finance/Passport source invalidation. Verify foreign/anonymous document and reminder requests are denied. Confirm signed download works, expiry/deletion blocks reuse and logs contain no URLs/cookies/content. Confirm a due exit/pension reminder appears, snooze/dismiss is durable, source resolution removes it and expired sessions are cleaned without affecting active sessions. Existing integration/browser suites cover these behaviors locally; do not run their database cleanup against live data.

During a planned acceptance window, stop/restart only the target worker: readiness should fail after the 45-second heartbeat expiry while liveness stays 200, then recover. Do not flush shared Redis or change all live job due dates to test recovery. Local `tests/production-smoke.mjs` assumes fixture AI responses and mutates test job scheduling: **use only disposable infrastructure**, not live acceptance.

## Acceptance record and current blockers

| Area | Current evidence/status |
| --- | --- |
| Rumpty PostgreSQL | Not connected; target URL/identity/backup status unavailable. No live migrations applied. |
| Rumpty Redis/worker | Not connected; credentials/compute configuration unavailable. |
| Rumpty storage/privacy | Not tested live; bucket endpoint/credentials/policy unavailable. |
| Rumpty AI protocol/model | Not tested live; endpoint/key/model unavailable. Existing adapter compatibility remains an assumption. |
| Public HTTPS health/readiness | Not tested live; canonical domain/ingress/worker unavailable. |
| Backup/snapshot | Runbook prepared; no configured schedule, snapshot ID, or successful restore evidence supplied. |
| Local validation | See results below; these validate tooling and application behavior, not real Rumpty. |

Before Milestone 8, fill the live acceptance results with date, target environment, image digests, migration status, synthetic probe results, operator policy checks, monitoring and successful restore evidence. Keep credentials/signed URLs out of this record. Missing live access is the current blocker, not an observed Rumpty incompatibility.

## Local validation record — 4 October 2026

- `npm run validate`: passed lint, typecheck, **214 unit tests**, production web build and compiled worker/operator build.
- `npm run test:integration`: **81 passed**, including ownership, evidence, queue recovery/retries/concurrency and session cleanup against disposable PostgreSQL/Redis.
- All nine existing migrations applied to a fresh disposable database; repeat migration-container deploy found none pending. Both local and migration-container schema drift checks reported no difference. No new migration was necessary for deployment tooling; **none was applied to Rumpty**.
- Web, worker/operator and migration Docker targets built. Generated secrets were confined to a temporary mode-0600 fixture env file, never tracked or printed.
- Operator `--services --storage --ai` passed through local TLS fixtures: migration checksums, Redis operations, private/signed-access control flow, expiry/deletion and six strict extraction fixtures. The fixture server is **not a cryptographic signature verifier**; real Rumpty signature/policy enforcement remains untested. The known tampered-signature fixture is rejected so the probe's failure path can be exercised locally.
- Production-container smoke passed auth/revocation, private document transport, AI/PDF pipeline, exits, finance, Passport, worker reminders, snooze/audit and expired-session cleanup preserving active access.
- Operator `--runtime` passed through a local HTTPS reverse proxy with a trusted test certificate. Stopping the worker produced HTTPS readiness 503/liveness 200. Runtime acceptance validates JSON status/service and no-store headers, not merely HTTP 200, to reject an ingress login/catch-all page.
- Missing production configuration returned nonzero without secret values. Environment tests cover missing role-specific variables, unsafe origins/embedded credentials, malformed connection URLs, fixture secrets and disabled worker readiness. Health tests reject incorrect/cached/catch-all responses.
- First browser run: 48 passed; one five-second upload UI wait timed out while heavy builds ran concurrently. The upload helper now asserts the completed API response before checking the success state. The full rerun passed **49/49 Chromium tests** at the existing mobile viewports. No tests were skipped.

The initial all-interface test-proxy command was rejected by automatic approval review; binding the proxy and service fixtures to loopback was accepted and supported the checks. No live deployment action was attempted or blocked by that review. Real Rumpty access remains the separate unresolved prerequisite.

Final result: **214 unit, 81 integration and 49 browser tests passed**, together with lint/typecheck, production and worker/operator builds, Docker/migration/drift and local TLS smoke checks. The rebuilt operator image rejected absent-worker readiness and passed after worker restart. `git diff --check` passed. Disposable containers, local TLS fixture/proxy processes and the temporary fixture env file were removed. No credentials were hardcoded or committed, no commit/push/deploy occurred, and no Milestone 8 features were implemented.

## Deployment blocker follow-up

See [private-network execution, S3/AI diagnosis and manual backup fallback](RUMPTY_BLOCKERS.md) for current results and operator steps. Internal PostgreSQL/Redis DNS is expected to require a Rumpty-hosted workload; no public access is needed.
