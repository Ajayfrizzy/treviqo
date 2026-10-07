# Scheduled account deletion

Profile deletion requires the authenticated owner's current password and exact
`DELETE`. The request schedules cleanup; it does not erase files or records.

## Lifecycle and schema

The additive migration `20261007020000_scheduled_account_deletion` adds
`User.deletionScheduledFor`, `deletionRetryAt`, and `deletionAttempts`. Existing
`deletionStartedAt` now marks irreversible worker processing. An index covers
scheduled dates and retry eligibility. No duplicate lifecycle enum is needed:

- Active: both scheduled and started timestamps are null.
- Deletion pending: scheduled date exists, started timestamp is null.
- Deleting: started timestamp exists. Cancellation is permanently unavailable.

The deadline is exactly seven 24-hour days after the scheduling clock, stored in
UTC. UI dates include time and explicitly use Africa/Lagos (West Africa Time).
Legacy accounts with a non-null `deletionStartedAt` may already have lost files;
the migration makes them due immediately by copying that timestamp into the
scheduled field. They cannot be restored through cancellation.

`AuditEvent.employmentId` becomes nullable for account-level events. New
`account_deletion_scheduled` and `account_deletion_cancelled` actions record no
password, storage key, document content, or provider message.

## Scheduling and disabled access

`DELETE /api/account` retains same-origin JSON, bounded 4 KiB input, strict fields,
global auth throttling, per-account password throttling and server-derived
ownership. A short transaction locks the User row, rechecks the verified hash,
stores the deadline, revokes every AuthSession and records scheduling atomically.
Repeated already-authorized requests preserve the original date. Storage APIs are
never called by this request. Successful HTTP 202 returns the scheduled date and
expires local/Secure/chunked session cookies. The browser performs a full
navigation to clear private router state and shows scheduling confirmation.

Normal session validation checks both account timestamps as well as session
ownership/expiry. Session creation takes the same User lock and rejects disabled
accounts, preventing a concurrent login from recreating access after revocation.
Uploads use this lock before reservation and around storage PUT, and reject both
pending and deleting accounts. Unfinished reservations remain available to the
worker instead of blocking scheduling indefinitely. Already-authorized requests
may finish; new requests cannot authenticate. Existing private signed download
URLs can remain usable until their existing short expiry (up to 60 seconds).

## Sign-in and cancellation

Unknown emails and wrong passwords both produce `Email or password is incorrect.`
Absent accounts still perform dummy password verification. Database, Redis and
auth-service failures produce `Sign-in is temporarily unavailable. Please try again
shortly.` Provider exceptions are never returned to the browser.

Only after correct password verification does the credentials provider reveal a
pending date or irreversible-processing state. It returns an allowlisted state
error instead of a NextAuth user, so no application session is created. This
restricted screen lives in the sign-in flow; it cannot access application APIs.

“Cancel account deletion” asks for credentials again and submits an explicit
cancellation intent through the existing CSRF/Origin-protected NextAuth credentials
flow. Email knowledge, old cookies, URL parameters and a previous pending screen
cannot cancel deletion. After verification, the transaction locks User, rejects
processing or `scheduledFor <= now`, clears schedule/retry fields, revokes stale
sessions and audits cancellation. NextAuth then creates a fresh normal session.
If session creation fails or scheduling wins a concurrent race, sign-in fails
closed; no old session is restored. The user can leave deletion scheduled without
creating a session or changing account state.

## Worker and retry behavior

The existing PostgreSQL job outbox/Redis queue now includes `account_cleanup`.
Each bounded run selects one due, retry-eligible account. Under the User lock it
checks the deadline again, sets `deletionStartedAt`, revokes sessions and marks
owned documents Deleting. This lock also serializes cancellation against cleanup.
At most three unpurged object keys are handled per run; confirmed absence is
checkpointed in `EmploymentDocument.storagePurgedAt`. Failed, unfinished and
historically deleted document rows remain included.

Failures retain the disabled account, unpurged keys and checkpoints. Per-account
retry delay doubles from 10 seconds to a maximum of 30 minutes, so one failed
account does not block other due accounts. The worker continues bounded retries;
lease recovery and Redis queue repair remain in the existing runner. No provider
messages or storage keys are persisted as errors. Operators should monitor overdue
scheduled accounts and their retry counters as well as global worker health.

After all objects have confirmed absence, a Serializable transaction deletes:

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
13. User (last)

A transaction failure rolls back relational cleanup while retaining completed
storage checkpoints. Retries and missing accounts are idempotent. Passport and
employer summaries are derived, not independent retained tables. No completion
message is shown merely because scheduling or a worker attempt succeeded.

## Rumpty object storage

`S3_VERSIONING=unversioned` is the default compatibility mode. It uses HeadObject,
DeleteObject, then HeadObject to verify absence. Already absent keys (404,
NoSuchKey or NotFound) count as successfully erased, including manual removal.
AccessDenied, unexpected failures and a still-accessible object fail closed.
ListObjectVersions is not required in this mode. A non-null version ID returned
by HEAD is rejected as a configuration mismatch.

Set `S3_VERSIONING=versioned` only for a deployment with confirmed versioning and
compatible version APIs. That adapter path still erases exact-key versions and
delete markers, inventories again, and verifies HEAD absence. It never silently
falls back from failed version inventory to unversioned deletion. Each purge is
bounded by a ten-second abort signal. All provider behavior stays in the adapter.

Before production rollout, confirm the actual Rumpty bucket's versioning/history
and permissions. HEAD absence alone cannot prove absence of hidden historical
versions in a misconfigured versioned bucket. Live provider behavior has not been
verified by local protocol fixtures. Provider backups, inference retention and
previously downloaded copies are outside active-system cleanup and need separate
retention policies; UI disclosure remains concise.

## Validation and rollout

Use disposable PostgreSQL/Redis and synthetic private S3/AI fixtures. Never run
migration resets or destructive smoke tests against production. Deploying this
change later requires the additive migration and the updated web and worker
artifacts. Existing legacy partial deletions are immediately eligible for cleanup,
so review that population before a separately authorized rollout.

Tests cover password/confirmation/ownership and Origin boundaries, exact deadlines,
session revocation, disabled access, credential-gated pending state, cancellation,
expired deadlines, storage absence/failure/checkpoints, all child tables, User-last
cleanup, database rollback, upload locking, bounded retries and worker dispatch.
