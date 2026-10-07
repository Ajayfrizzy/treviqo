# Profile: Delete Account

Delete Account is deliberately separate from ordinary Profile actions. It requires a signed-in owner, their current password and the exact text `DELETE`. The password uses the existing Argon2 verifier and is never trimmed, stored, logged or sent to storage. Legacy password formats still verify against their existing hashes. There is no user ID/email/ownership selector in the request.

## Sequence

1. `DELETE /api/account` checks the server session, exact Origin, JSON content type, the existing global auth limiter and streamed 4 KiB body limit. The strict body schema permits only password and confirmation. The service uses the session's User ID, shares the existing per-account password limiter and re-verifies the current password for every attempt/continuation. Invalid authentication/confirmation performs no cleanup.
2. A short transaction locks the User row and checks the password hash has not changed since verification. Unfinished uploaded/processing reservations block deletion before destructive work: let the upload finish, or reconcile/remove its pending entry first. There is no automatic age-based bypass in account deletion.
3. The transaction persists `User.deletionStartedAt` and marks **all** owned document rows Deleting. New signed access/extraction is unavailable. Upload reservation and the bounded storage PUT now take the same User lock and check deletion intent. This prevents a concurrent upload from writing an untracked file after account cleanup. The upload key is reserved durably before PUT; a failed transaction/crash retains the key for recovery.
4. Up to three unpurged document keys are cleaned per request. This includes Ready, Failed, Deleting and historically Deleted rows; an earlier normal DeleteObject could have left versions. The storage adapter inventories exact-key object versions and delete markers, deletes their version IDs, deletes the current unversioned object where applicable, rechecks the inventory, and requires HeadObject absence. Permission denial, timeout, malformed/unsupported inventory, incomplete listings, retained objects or locked versions all fail closed. No prefix-neighbour object is deleted. The entire purge of one key has a ten-second signal, twenty inventory rounds maximum and no SDK retry. Per-key success is durably recorded in `EmploymentDocument.storagePurgedAt`.
5. If keys remain, HTTP 202 returns Pending. The account is **not** deleted. Profile explains partial irreversible progress and asks for password plus DELETE again to continue. There is no background job, retained password, automatic retry or weakening of auth limits. Large accounts may need several attempts; the existing 10 attempts/15 minutes limit includes sign-ins and deletion confirmations.
6. Only once every owned object is checkpointed does a Serializable transaction lock the User row and remove dependent database records, all sessions and finally User. It has a ten-second transaction timeout; failures roll back database cleanup and session revocation together. The object checkpoints remain, so a retry does not need to repeat successfully completed purges.
7. After commit, the response expires NextAuth local/Secure session cookies, chunked session cookies, CSRF and callback cookies. The browser performs a full navigation to `/sign-in?account=deleted` to discard the private router state and displays confirmation. Copied cookies and other-device cookies no longer authorize requests because **all** AuthSession rows were removed. Concurrent stale requests cannot recreate a deleted User through a child FK.

## Explicit Prisma cleanup

The additive migration `20261007010000_account_deletion` adds nullable deletion intent and object-cleanup timestamps. Existing restrictive relations remain restrictive. There is no cascade-policy change or production data migration/reset.

The final transaction deletes in this order, scoped by the authenticated User ID (including ownership through extraction relations):

1. AuthSession
2. Reminder
3. SettlementItem
4. PensionVerification
5. Benefit
6. ExitCase
7. ExtractionFieldRevision
8. ExtractedField
9. DocumentExtraction
10. EmploymentDocument
11. AuditEvent
12. Employment
13. User

EmploymentDocument → User/Employment and AuditEvent → User use Restrict. Tests prove direct User deletion fails when these dependents exist, then exercise the complete transaction. Other Cascade relations remain defensive database constraints, not a replacement for explicit cleanup. Employer and PassportEntry are derived concepts in the current schema, not additional tables to delete. BackgroundJob contains shared scheduler state; it is not user-owned and is retained. Transient Redis throttle keys expire under their existing TTLs; they contain hashes/HMACs or opaque IDs, not document/password content. Shared Redis is never flushed.

## Failure and recovery

Storage cleanup and a database transaction cannot form one atomic transaction. The UI explains this **before confirmation**: files already removed cannot be restored if a later step fails. No cancellation/undo is offered after deletion intent; closing the form only closes the form. New uploads remain blocked while intent exists. Sessions are retained until the successful final transaction, allowing the owner to retry from Profile, sign out or sign back in; failed storage cleanup is not reported as completed account deletion.

On Rumpty `403 AccessDenied`, the route returns HTTP 503 with explicit incomplete-deletion/retry guidance. User, object keys, checkpoints and database dependents remain. Files are not made public, storage failures are not ignored and User deletion is not attempted. After permissions/retention issues are resolved, the owner retries with their password. Already missing objects are idempotent only when inventory and absence can be verified. If purge succeeds but saving its checkpoint fails, retrying rechecks/removes the same exact key. If final database cleanup fails, all dependent records and sessions survive rollback and can be retried. A lost success response is inherently uncertain: refresh/check sign-in before retrying; never infer success from a timeout. A subsequent request with a revoked session returns 401.

Only a fixed `account_deletion_incomplete` label is logged for unexpected failure; no error message, stack, password/hash, document content, filename/key, session or User ID is logged by this flow. Intent/checkpoints provide recovery state while pending; account-associated audits are removed during final cleanup. Configure ingress/APM to redact the DELETE request body and Cookie/Set-Cookie headers as for sign-in. No deletion receipt containing an account identifier is retained in a new log/table.

## Rumpty limitations and release requirements

Rumpty previously returned AccessDenied for DeleteObject. This task did not access or delete live user documents, change bucket permissions, deploy code or assert that provider-side deletion is fixed. Production success is conditional on all required scoped permissions: ListBucketVersions on the application bucket (prefix-limited where supported), DeleteObject and DeleteObjectVersion on Treviqo's owned keys, and GetObject/HEAD for absence verification. If listing or version deletion is unsupported/denied, the account stays pending. Check object lock/retention policies rather than bypassing them. Do not grant public or unrestricted access to make deletion pass.

The flow removes application-owned active records and objects/versions at the configured bucket. It cannot erase copies a user downloaded, independent provider backups/snapshots/replicas, or previously retained AI processing copies. These limits are visible before confirmation. Rumpty retention and deletion policies still require operator verification; the UI does not promise instantaneous removal from backups. Restore procedures must reconcile deletions before restoring service and must not resurrect deleted accounts/documents without an approved retention process. Historical untracked objects created outside the application's durable reservation path require separate operator inventory; this flow cannot attribute arbitrary bucket objects to a user.

Before a future authorized rollout, apply the additive migration, stop/drain older upload writers and roll all web instances to the same candidate. Old application versions do not honor deletion intent. Verify scoped purge/absence/version behavior using synthetic objects on Rumpty and run hosted cross-user/session/partial-failure checks. Never use destructive integration/browser test cleanup against production.

## Validation

The implementation adds unit tests for input/Origin/session/cookie/logging boundaries and exact-key version purge with permission failures. Disposable PostgreSQL tests cover real password verification, restrictive FKs, every dependent table, session revocation, owned-object isolation, partial batches, storage denial, failed checkpoints/final transactions, unfinished uploads and upload/deletion races. Browser tests exercise the actual TLS-compatible S3 protocol adapter through a synthetic fixture with an explicit AccessDenied mode; no live provider or user documents are involved.

Final commands and results are recorded in the completion report. The test-only S3 failure-control endpoint exists solely in `tests/fixtures/s3-server.mjs`; it is never a production route.

## Validation record — 7 October 2026

All database commands below used a newly created disposable local PostgreSQL database, with separate loopback Redis. No live Rumpty database, account or document was changed.

- `npm run db:generate` and `npx prisma format`: passed.
- `DATABASE_URL=postgresql://treviqo_test@127.0.0.1:25432/treviqo_test npm run db:deploy`: all ten migrations, including the new additive migration, applied to the disposable database only.
- `npm run validate`: lint, TypeScript, **262 unit tests**, production build and worker build passed.
- `DATABASE_URL=postgresql://treviqo_test@127.0.0.1:25432/treviqo_test REDIS_URL=redis://127.0.0.1:26379 npm run test:integration`: **94 tests passed**, including ten new account-deletion tests and document-upload regressions.
- `DATABASE_URL=... REDIS_URL=... npm run test:e2e -- tests/e2e/account-deletion.spec.ts tests/e2e/documents.spec.ts tests/e2e/polish.spec.ts tests/e2e/foundation.spec.ts`: 40 passed initially; the storage-failure case's alert selector also matched Next.js's route announcer. After scoping it to the Delete Account region, `npm run test:e2e -- tests/e2e/account-deletion.spec.ts --grep 'real storage AccessDenied'` passed. All **41 selected cases** now have passing results; no remaining browser failure. The correction changed the test selector, not the deletion behavior.
- `DATABASE_URL=... npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code`: no difference detected.
- `DATABASE_URL=... NODE_EXTRA_CA_CERTS=/tmp/treviqo-delete-smoke/cert.pem node tests/account-deletion-production-smoke.mjs`: passed against the actual standalone production artifact at loopback port 3200, a synthetic HTTPS app origin, disposable DB/Redis and a locally trusted TLS S3 fixture. Covered wrong password, actual SDK AccessDenied, safe retry, verified object removal, all-session revocation, Secure-cookie expiry, copied-cookie rejection and User-last cleanup. No TLS verification bypass was used. WORKER_REQUIRED=false was scoped to this isolated account test, not production readiness.
- Prettier checks on new/changed implementation/tests, `npm run lint`, `npm run typecheck` and `git diff --check`: passed.

Reviewed the 320px storage-failure screenshot: the Danger area, destructive action, password/confirmation fields and recovery message remain readable without horizontal overflow. Browser checks cover 320/375/430/1440px deletion and the existing 768px Profile regression. Native touch devices and hosted Rumpty versioning/permissions remain manual release checks. No live deletion test was attempted because the task did not authorize deletion of real accounts/documents; the known provider 403 is not claimed resolved.

## Changed areas

- `prisma/schema.prisma` and `prisma/migrations/20261007010000_account_deletion/migration.sql`: durable intent and object cleanup checkpoints.
- `src/modules/account/{shared,service}.ts` and `src/app/api/account/route.ts`: validated owner-only deletion, explicit cleanup transaction and successful cookie clearing.
- `src/server/storage/client.ts` and `src/modules/documents/service.ts`: verified exact-key version purge and upload/deletion coordination.
- `src/components/delete-account.tsx`, Profile, sign-in and scoped CSS: isolated danger area, confirmation/recovery and successful return to sign-in.
- Account unit/integration/browser/production-smoke tests, storage tests and document regression tests; synthetic storage fixture/fake adapter support.
- Security, UI/Profile and testing documentation.

No commit, push or deployment was performed. Disposable containers and local fixture/smoke servers are removed after validation; generated screenshots remain in ignored test-results for review.
