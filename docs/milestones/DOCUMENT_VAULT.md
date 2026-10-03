# Milestone 2 — Secure Document Vault

Implemented October 3, 2026. Authenticated workers can upload, filter by employment, inspect metadata, request private downloads, and delete their own documents. No AI/OCR, extraction, exit, settlement, pension, benefits, or Passport workflow was implemented. Nothing was committed, pushed, or deployed to Rumpty.

## Architecture and data

The existing Next.js modular monolith now includes `src/modules/documents`. Services reuse authenticated sessions, Prisma, and the Rumpty-compatible storage adapter; injectable storage supports isolated tests without duplicating orchestration. Browser uploads travel as bounded binary requests through the app; PostgreSQL stores metadata and audit records, and a private bucket stores original bytes.

Migration `20261003030000_document_vault` adds EmploymentDocument, AuditEvent, document categories/statuses/actions, indexes, explicit User ownership, and a composite employment-owner foreign key. It adds an Employment id/userId unique constraint without deleting or changing auth data. Documents store original/sanitized filenames, random object key, detected MIME, bytes, SHA-256 checksum, category, status, and timestamps. Audit events contain IDs, action, and timestamp only. Uploaded, Processing, Ready, Failed, Deleting, and Deleted states support recovery; normal uploads finish Ready.

Categories: employment contract, payslip, resignation letter, termination letter, exit letter, pension statement, final settlement, reimbursement evidence, benefit document, and Other. Other is the default when unknown.

PDF, JPEG, and PNG are accepted. `DOCUMENT_MAX_FILE_MB` defaults to 10 MiB and accepts integers 1–20. Filename/extension, supplied MIME, magic bytes, and basic terminal structure are checked. The body reader enforces actual bytes, regardless of Content-Length. Filenames with control/bidi characters are rejected; path components are removed and display/download names sanitized. Original filenames remain private metadata. Signature checks do not establish that a file is safe or completely parseable.

Keys use `users/{userId}/employments/{employmentId}/documents/{documentId}/{randomUUID}.{detectedExtension}`. Identifiers are validated and generated on the server. Raw filenames never become paths; random keys do not substitute for authorization.

## Access, deletion, and consistency

All operations independently authenticate and scope records to the session user and employment owner. Client input cannot set ownership. Mutations require exact Origin; errors are generic for infrastructure failures and foreign/missing records share 404. DTOs omit keys, checksums, and owner IDs. Responses disable caching.

Ready documents receive signed GET URLs valid for 60 seconds, with attachment disposition and sanitized filename. The service locks the row against deletion and commits `document_access_issued` before returning the link. Signed URLs are bearer credentials; access auditing records issuance, not actual viewing. Existing links remain usable until expiry or object removal. Files already downloaded cannot be revoked.

Upload first reserves an Uploaded row, then PUTs privately, then atomically marks Ready and records `document_uploaded`. Failed PUTs trigger best-effort deletion and a Failed row. If cleanup fails, the durable key remains available for retry. If finalization fails or commit acknowledgement is lost, the row/object are retained for reconciliation rather than blindly deleting a possibly committed upload. Inaccessible pending rows may still hold an object.

Deletion marks Deleting before object removal, blocking new links, then atomically marks Deleted and records `document_deleted`. Missing objects are safe to remove again. Failures leave visible retryable state. Fresh Uploaded/Processing rows cannot be removed for 15 minutes, avoiding normal upload races; after confirming the upload has stopped, stale rows can be removed through the same service. No distributed transaction or automatic cleanup worker is claimed. A severely delayed provider write after cleanup remains a distributed-system edge case; reconcile stale keys/provider inventory operationally.

Deleted metadata and audit tombstones are retained and hidden from normal lists. Restrict foreign keys prevent account/employment removal from orphaning document references. This is not full account erasure. Versioned buckets may retain prior objects under a delete marker; configure lifecycle and backup retention separately.

## Files and dependency

- `prisma/schema.prisma`; `prisma/migrations/20261003030000_document_vault/migration.sql`.
- `src/modules/documents/{shared,validation,service,http,page-user}.ts`.
- `src/server/storage/client.ts`, `src/server/config/env.ts`, `.env.example`.
- `src/app/api/documents/route.ts`, `[id]/route.ts`, `[id]/access/route.ts`.
- `src/app/(app)/documents/` list/upload/detail/loading/error/not-found pages.
- `src/components/document-upload.tsx`, `document-actions.tsx`, `navigation.tsx`; `src/app/globals.css`.
- `tests/document-validation.test.ts`, `storage.test.ts`, `documents.integration.test.ts`, `helpers/fake-storage.ts`, `fixtures/document.pdf`, `fixtures/s3-server.mjs`, `e2e/documents.spec.ts`, `e2e/foundation.spec.ts`, `production-smoke.mjs`; `playwright.config.ts`.
- `package.json`, `package-lock.json`, README, architecture/security/UI/testing/deployment docs, and this report.

Only new runtime dependency: `@aws-sdk/s3-request-presigner`, for established S3-compatible signing using the existing client. No AWS infrastructure, new service, or competing provider was added. The sole new application environment variable is `DOCUMENT_MAX_FILE_MB`; existing S3 variables are now used for private object operations.

## Validation results

| Exact command | Result |
| --- | --- |
| `npm run db:generate` | Passed |
| `npm run lint` | Passed, including final smoke/test changes |
| `npm run typecheck` | Passed, including final test changes |
| `npm test` | 50 passed |
| `npm run db:deploy` | All four migrations applied to disposable PostgreSQL 17 |
| `npm run test:integration` | 24 passed; no skips |
| `npm run test:e2e` | 26 passed; no skips |
| `npm run build` | Passed |
| `npx prisma migrate diff --from-url postgresql://treviqo_test@127.0.0.1:55432/treviqo_test --to-schema-datamodel prisma/schema.prisma --exit-code` | No difference detected |
| `docker build -t treviqo:m2 .` | Production image built successfully |
| `docker build --target migrate -t treviqo-m2-migrate .` | Release image built successfully |
| `docker run --rm -e DATABASE_URL=postgresql://treviqo_test@host.docker.internal:55432/treviqo_test treviqo-m2-migrate` | Four migrations found; no pending migrations |
| `docker exec treviqo-m2-smoke node tests/production-smoke.mjs` | Passed auth, non-root runtime, secure cookies, vault upload/TLS download/anonymous denial/delete/three audits |
| `npm audit --omit=dev` | Zero production vulnerabilities |
| `git diff --check` | Passed; implementation files remain untracked as they were at task start |

Integration/browser commands used exported `DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test` and `REDIS_URL=redis://127.0.0.1:56379`. Disposable services used synthetic data, not real credentials. Docker smoke used a temporary TLS certificate and trusted it through NODE_EXTRA_CA_CERTS; TLS verification stayed enabled. Test services were removed afterward.

An initial npm audit attempt failed due to sandbox DNS; the network-enabled retry passed. Docker npm ci reported five high development dependency advisories; the production-only audit is clean. No forced dependency upgrades were made. Expected expired-session logs and color-environment warnings occurred in browser tests.

Browser checks exercised upload, filter, detail, signed download, deletion/cancel, empty/success/error/retry states, invalid/oversized files, unauthenticated/cross-user/cross-origin denial, and no horizontal overflow at 320/375/430px. Detail screenshots at all three widths were visually reviewed. The existing employment/auth suites also passed. The local S3 fixture checks expiry/anonymous denial but does not cryptographically verify signatures or reproduce real bucket policies/versioning.

## Remaining configuration and limits

Supply real Rumpty HTTPS S3 endpoint, region, bucket, restricted credentials and addressing mode; apply migration before rollout. The signed endpoint must be browser-reachable. Verify private bucket policy, private ACL support, signing/expiry, deletion, TLS, least privilege, version/backup retention, and restore behavior against Rumpty. Existing PostgreSQL/Redis/session configuration still applies. Readiness proves connectivity only. See the deployment runbook for limits and stale-record reconciliation.

Before public launch, configure ingress size, timeout, concurrency, and abuse limits. Files are buffered within the configured per-request bound; no user storage quota, pagination, antivirus, automatic reconciliation, or full file parser is implemented. Physical-device file pickers and live Rumpty behavior remain manual checks. Attachment downloads intentionally avoid an embedded untrusted-document viewer. Retry upload is not idempotent across ambiguous responses and may create a duplicate; inspect the list before retrying. Deleted metadata retention needs a future explicit erasure policy. These limits do not implement or simulate Milestone 3+ functionality.
