# Document deletion recovery investigation — 18 October 2026

## Findings and limits

The reported `01_payslip.pdf` / Briarwell incident has not been reproduced against
production. No production object, metadata, credentials or permissions were changed.
The filename is not a storage identifier; never locate or erase an object by filename
alone. Use the owner's document ID and its exact stored key in an authorized operator
context, and independently confirm the employment association.

The earlier [Rumpty investigation](RUMPTY_BLOCKERS.md#s3-deletion-diagnosis)
recorded DeleteObject AccessDenied/403 and HeadObject 200 for a synthetic object.
That proves deletion was denied for those credentials at that time, not which
policy caused it or how HEAD behaves for a missing object today. Console deletion
can use a different principal and does not prove application DELETE authorization.

Current document removal already persists `deleting`, calls verified `purge`, then
atomically writes `deleted` / `storagePurgedAt`, removes extraction data, and audits
completion. Failure preserves the pending row and key. A failed final transaction
can safely retry against the absent key. The unversioned adapter checks HEAD first,
so verified manual removal needs no further DELETE permission. DELETE acknowledgement
alone never finalizes the row.

The confirmed code defects were ambiguous purge diagnostics and an absence predicate
that allowed a missing-object error name to override a conflicting HTTP status.
The narrow correction gives HTTP denial/error precedence over missing names, rejects
explicit missing-bucket errors, and identifies DELETE versus absence-verification
failures using safe operation/category/status/code tokens. No provider messages,
keys, filenames, credentials or signed URLs are logged. Still-present objects and
versioning mismatches also have explicit diagnostic categories.

## Production checks still required

1. Confirm the configured endpoint, bucket, region, path-style mode and app/worker
   principal in Rumpty without dumping secret values. Check `s3:DeleteObject` for
   the intended object prefix, explicit denies, gateway compatibility, retention
   and legal holds. Do not bypass retention, grant public access or switch credentials
   as a diagnostic workaround. DELETE uses the ordinary signed S3 DeleteObject
   request; no ACL or governance-bypass flags are sent.
2. With the same application principal, perform read-only HeadObject on the exact
   pending key and a confirmed missing key in the permitted prefix. Record only
   operation, HTTP status and allowlisted error code. The actual missing-key response
   under current Rumpty permissions remains unverified by this investigation.
3. Under AWS S3 semantics, HeadObject needs `s3:GetObject`. Missing objects return
   404 when the caller has applicable `s3:ListBucket`, but may return 403 without it.
   Confirm Rumpty's equivalent policy and prefix-condition behavior. If required,
   grant narrowly scoped bucket ListBucket permission for the intended prefix so
   absence can be distinguished, retaining object-scoped GetObject/DeleteObject.
   Do not assume a blanket ListBucket grant or broad administrator role is necessary.
   A 403 can mean absent-but-hidden **or** denied access to an existing object;
   neither permits database finalization. 5xx, timeouts and unexpected responses
   also remain pending.
4. Verify actual bucket versioning independently. Unversioned mode requires
   HEAD/DELETE/HEAD and never lists versions. Versioned mode additionally requires
   ListBucketVersions and DeleteObjectVersion equivalents and exact-version cleanup;
   manual deletion of only the current version/creation of a delete marker is not
   proof that all versions are absent. Do not change mode merely to avoid a denial.
5. Once absence is verifiable, have the authenticated owner retry the existing
   document deletion action. Confirm the row becomes deleted with storagePurgedAt
   and exactly one document_deleted audit; verify access remains blocked. Do not
   manually mark a pending database row deleted to bypass storage verification.

## Worker ownership and retries

There is no general background job for an active user's pending single-document
removal. Recovery is the existing owner-authorized retry. The account_cleanup job
only handles accounts whose scheduled deletion is due. It checkpoints at most three
verified objects per pass, retries failures with per-account exponential backoff
(10 seconds up to 30 minutes), and preserves completed checkpoints. PostgreSQL
leases and Redis queue reconstruction remain unchanged. A pending document must
not cause its active owner's account to enter scheduled cleanup.

## Validation

Focused coverage includes real-SDK HEAD/DELETE/HEAD, missing-key 404 versus 403,
already-absent objects with DELETE denied, denied DELETE, denied verification,
contradictory NotFound/403 and NotFound/500 responses, still-present objects,
versioning mismatch, database rollback/retry, one completion audit, scheduled
cleanup retry eligibility and checkpoint safety. Integration tests use disposable
local PostgreSQL/Redis with mocked S3 responses, not live Rumpty permissions.

Results: **488 unit tests and 55 focused integration tests passed**. Lint,
TypeScript, production build, worker build, formatting and diff checks passed.

Commands:

- `npm test`
- `npm run test:integration -- tests/deletion-recovery.integration.test.ts tests/documents.integration.test.ts tests/account-deletion.integration.test.ts tests/jobs.integration.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run worker:build`

The first unit run could not bind fixture sockets in the sandbox; rerunning with
loopback access passed. The first integration run had no local database available;
fresh disposable PostgreSQL 17 and Redis 7 containers were then provisioned and all
12 migrations applied only to that test database. No UI changes or live mobile
checks were made. Production permission/retention and missing-key response checks
above remain operator acceptance work.
