# Milestone 7 — Reminders, Reliability & Security

Implemented 4 October 2026. Extends the modular monolith; no new dependencies, infrastructure providers, external messages, or Milestone 8+ features.

## Architecture and changed areas

- `src/modules/reminders`: deterministic candidates, owner-scoped reconciliation/read/commands and HTTP boundary; `/api/reminders`, `/reminders` and Home entry point.
- `src/server/jobs`: PostgreSQL durable job records, Redis due queue, leases/retries and health; `src/worker` runs the same domain services in a separate Rumpty process.
- Additive migration `20261004010000_reminders_reliability`: Reminder, BackgroundJob, ownership/index constraints and audit actions. Existing auth/domain rows are preserved.
- `src/server/rate-limit.ts`, module HTTP handlers, employment service/audits, readiness/config, Docker/worker compiler/CI scripts, unit/integration/browser/production smoke tests and project documentation.

PostgreSQL is authoritative. Redis contains only logical job IDs and a heartbeat, never document text. Two recurring jobs reconcile reminders in keyset batches of 20 exit cases and delete expired authentication sessions in batches of 500. A sweep repeats after 60 seconds; the worker ticks every 10 seconds. Compile with `npm run worker:build`, then run `npm run worker` with exported environment variables (or Node's `--env-file=.env` before the compiled entry point). There is no runtime TypeScript dependency.

## Reminder behavior

| Type | Trigger and next action |
| --- | --- |
| Exit action | Unresolved current checklist item; review its answers/evidence. First follow-up is the earlier of case creation plus one day or last working date. |
| Missing document | Missing final salary, reimbursement, asset acknowledgement, exit document or reference evidence; open the source checklist. |
| Pension follow-up | Saved follow-up date is due, pension applies and current contribution state is not confirmed; open finance review. |
| Stale action | Exit answers unchanged for seven days with unresolved items; review current checklist. |

Dates are planning conventions, never statutory deadlines. UTC is used for date-only boundaries. No AI makes reminder decisions. The mobile screen supports refresh, source links, seven-day snooze, dismissal, empty/loading/error/success states and a delayed-worker warning; the five primary navigation sections remain intact.

One row per case/rule key represents the current episode. A versioned fingerprint of current state/evidence preserves snooze/dismiss across retries and resurfaces materially changed episodes. Completed/not-applicable/disappeared actions resolve. Reads independently recompute source rules, so stale or deleted evidence never keeps an obsolete reminder actionable. Commands validate owner, current fingerprint and optimistic version; a changed episode can require refresh after worker reconciliation. Audits and state changes commit atomically.

## Reliability and cleanup

Redis queue loss is repaired from due PostgreSQL rows every tick. Atomic queue pop and database conditional claim prevent duplicate claims; two-minute leases recover crashed work. Lease tokens fence completion. Retries start at 10 seconds and back off exponentially to 30 minutes. Repeated reconciliation/session deletion is safe, with no duplicate transition audit. Batches commit their cursor only after successful work. SIGTERM/SIGINT stops after the current bounded tick.

Session cleanup only deletes `expiresAt <= now`, rechecking expiration in the delete. Live sessions survive. Authentication already enforces expiry on every request, so a delayed cleanup cannot extend access. Job failures persist generic codes; no provider error contents are logged. A failing case retries its batch indefinitely and can delay the reminder sweep: monitor/repair the cause rather than silently discarding work.

## Security review and fixes

Reviewed auth/session revocation, employment, private document access/deletion, extraction review, exit/finance/Passport ownership and new reminder boundaries. Existing composite ownership checks, same-origin mutation checks, strict bounded inputs, private no-store responses, source revalidation and content-free transactional audits remain. Employment creation, updates and transition to closed now have atomic audits. Reminder reads/commands cannot target another worker's data; queue payloads cannot choose arbitrary work.

New per-user Redis atomic limits: uploads 20/10 minutes, signed access 60/10 minutes, shared writes 120/minute and expensive API reads 120/minute. Existing extraction starts (10/10 minutes) and auth limits remain. Keys hash user IDs; 429 includes actual Retry-After. Redis failure fails protected workflows closed with safe 503; the worker retries without claiming successful processing. Server-rendered reads still require ingress rate/concurrency protection. Rate counters are ephemeral: Redis persistence/noeviction and ingress protection are operational requirements.

No production dependency advisories were reported by `npm audit --omit=dev --json` during validation. This is not a penetration test. No reset/MFA/email-verification product flow is added.

## Health and operations

Liveness remains independent of dependencies. Readiness checks auth configuration, PostgreSQL including new tables, Redis and bucket connectivity; it also requires worker health by default in production. `WORKER_REQUIRED` is the only new optional environment variable; blank means true in production and false in development/test. Worker health requires a fresh 45-second heartbeat, both durable jobs, fewer than five consecutive failures, backlog below five minutes and a completed sweep within two hours (two-minute initial grace). Checks expose only generic failure status and do not run paid AI inference. Bucket connectivity does not prove bucket privacy.

Use explicit Docker targets `runtime`, `worker`, and `migrate`; default remains the web image. Runtime and worker run as UID 1001. See the [Rumpty operations and restore runbook](../deployment/RUMPTY_DEPLOYMENT.md#milestone-7-worker-and-recovery-runbook).

## Validation

Tests use disposable PostgreSQL/Redis and synthetic S3/AI protocol fixtures; no live Rumpty inference, deployment or production data is involved.

| Command/check | Result |
| --- | --- |
| `npm run validate` | Passed lint, strict typecheck, 208 unit tests, production Next.js build and worker compilation. |
| `npm run test:integration` with disposable URLs | 81 passed, including 11 worker/reminder/rate-limit integration cases. |
| `npm run test:e2e` with disposable URLs | 49 Chromium tests passed; reminder workflows at 320/375/430px. |
| `prisma migrate deploy` / migrate Docker target | All nine migrations applied to a fresh disposable database; repeat Docker deploy reported no pending migrations. |
| `prisma migrate diff --from-url <disposable-url> --to-schema-datamodel prisma/schema.prisma --exit-code` | No difference detected. |
| `docker build --target runtime/worker/migrate` (each target separately) | All three images built. |
| `docker exec treviqo-m7-web node tests/production-smoke.mjs` | Passed non-root/auth/cookies/revocation, private TLS storage, fixture AI/PDF, exit, finance, Passport, worker reminders/snooze/audit and expired-session cleanup while preserving active access. |
| Worker health and runtime outage/restart checks | Health passed; absent heartbeat returned readiness 503/liveness 200; worker restart after deleting queue/heartbeat restored readiness 200. |
| `npm audit --omit=dev --json` | Zero reported production advisories. |
| `git diff --check` | Passed. |

The first full browser run had 48 passes and one test-selector failure: Next.js's route announcer also has an alert role. The error assertion now selects the alert containing the expected failure text; the complete rerun passed. No tests were skipped. Visually inspected the 320px reminder screenshot; automated viewport checks also cover 375/430px and verify no horizontal overflow. Real-device, live Rumpty and disaster-recovery acceptance remain manual.

## Known limits and production configuration

In-app reminders only: no email/SMS/push provider, calendar integration or external delivery guarantees. Reminder lists derive all owned cases without pagination; batch sizes/health thresholds need load testing at production scale. A delayed worker can postpone new rows; current-state revalidation still protects existing reminders. Worker health is shared service health, not a per-instance heartbeat registry. No automatic object-orphan cleanup or audit retention purge is introduced.

Rumpty must supply private PostgreSQL/Redis, always-on worker compute/restarts, TLS endpoints and secrets, private bucket policies, actual AI protocol/model configuration, ingress limits, monitoring and verified backups/restores. Local TLS fixtures do not validate Rumpty policy/signature enforcement or live model accuracy. No commit, push or deployment; no Milestone 8 polish/demo/deployment, family workflows, analytics, provider integrations, employer dashboards or native app.
