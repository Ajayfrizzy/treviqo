# Scheduled account deletion and sign-in errors

Implemented 7 October 2026. The [security specification](../security/ACCOUNT_DELETION.md)
describes lifecycle states, locks, cleanup ordering and provider limits.

## Schema and account state

The additive `20261007020000_scheduled_account_deletion` migration adds the scheduled
deadline and per-account retry date/count, plus a scheduling index. The existing
started timestamp is reserved for irreversible processing. Legacy partially erased
accounts remain non-cancellable and become due; they are never silently restored.
Account-level scheduling/cancellation audit actions use a nullable employment ID.
No new credentials, tokens or duplicate lifecycle-state enum are persisted.

Scheduling verifies current password and DELETE, atomically disables the account
and revokes every session, returns HTTP 202 with the actual seven-day deadline,
clears browser auth cookies and redirects out of the application. It calls no
storage destruction API. Active data remains until the worker's deadline gate.

Pending/deleting users cannot create or use application sessions or upload files.
Only a correct email/password pair reveals the restricted pending/processing
screen. Cancellation requires credentials again and the User lock, clears schedule
and retry fields before the deadline, audits the event, and lets NextAuth create a
fresh session. Old cookies remain revoked. Cleanup and cancellation are serialized;
a stale worker selection cannot restore cleared retry fields after cancellation.

Unknown emails and wrong passwords share `Email or password is incorrect.`
Infrastructure failures use `Sign-in is temporarily unavailable. Please try again
shortly.` Neither response exposes provider messages or account existence.

## Cleanup and storage

The existing worker dispatches `account_cleanup` through its durable job/outbox and
Redis queue. It reserves one eligible account, revokes sessions, purges at most
three document keys per batch and checkpoints verified absence. Failures retain
all recovery state and keep the account disabled, with retry delays of 10 seconds
up to 30 minutes measured from failure completion. All existing child tables are
removed in a transaction before User; confirmed storage checkpoints survive a DB
rollback. Completion is never inferred from scheduling or a failed purge.

Unversioned Rumpty storage now uses HEAD, DELETE, HEAD, and accepts already-absent
objects. Listing object versions is unnecessary in that mode. Explicit versioned
mode preserves the prior exact-version purge and fails closed on unsupported APIs.
A known version ID encountered in unversioned mode rejects cleanup. Configuration
is documented in `.env.example`; the actual `.env` was not changed.

## Changed areas

- Prisma schema and the additive migration.
- `src/modules/account/{service,shared}.ts`: scheduling, worker cleanup, retries and date presentation.
- `src/modules/auth/{credentials,options,session-store,sign-in-state}.ts`: lifecycle gates, credential-only cancellation, fresh sessions and safe errors.
- `src/app/api/account/route.ts`, sign-in/Profile pages, `auth-actions.tsx` and `delete-account.tsx`: scheduled confirmation and restricted cancellation UI.
- `src/modules/documents/service.ts`: pending/deleting upload checks under the existing account lock.
- `src/server/jobs/{queue,runner}.ts`: cleanup dispatch and exclusion of disabled users from reminder reconciliation.
- `src/server/storage/client.ts`, environment schema and `.env.example`: explicit bucket mode and compatible absence verification.
- Unit, integration, browser and guarded standalone smoke tests; security, architecture, deployment, UI and testing documentation.

## Validation

All DB migrations and destructive checks used disposable loopback PostgreSQL/Redis,
synthetic users and local S3/AI fixtures. No production migration was run.

- `npm run validate`: lint, TypeScript, 277 unit tests, production build and worker build passed.
- `npm run test:integration`: 102 tests passed, including deadlines, cancellation, session revocation, upload locking, audit rollback, cross-user isolation, worker backoff/checkpoints and User-last cleanup.
- `npm run test:e2e`: all 88 browser tests passed in 5.2 minutes on the final implementation.
- `npx playwright test tests/e2e/account-deletion.spec.ts`: all 7 passed, covering four mobile/desktop widths, actual worker storage failure/retry, credential gating and error messages.
- `npx playwright test --config playwright.navigation.config.ts`: both standalone production navigation/auth/logout checks passed over local HTTPS.
- `npx prisma migrate status`: all 11 migrations applied in the disposable DB.
- `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code`: no difference detected.
- Targeted `npx prettier --check` and `git diff --check`: passed.

The initial integration run exposed tests assuming only two worker jobs; those
assumptions were updated for the third job. Initial new browser error assertions
matched both Next's route announcer and the form message; they now target the form
error explicitly. These failures were resolved. The pending screen was visually
inspected at 320px; browser checks cover 320/375/430/1440px for the changed flow.

The guarded TLS account-deletion smoke script was updated but was not separately
executed in its dedicated container topology. Actual worker/S3 failure/retry was
exercised by the browser suite instead.

## Remaining deployment checks

Confirm the real Rumpty bucket's versioning/history, DELETE/HEAD permissions,
retention/object-lock behavior and backup/inference retention. A misconfigured
versioned bucket can hide old versions behind HEAD absence; configuration must
reflect the provider's actual mode. Signed URLs already issued may remain valid
until their existing expiry, and already-authorized requests can finish.

A later coordinated migration plus web/worker release is needed to enable this
lifecycle in production. Review legacy partial deletions before that rollout and
monitor overdue accounts/retry counters in addition to global worker health.
There were no production changes, commits, pushes or deployments in this task.
