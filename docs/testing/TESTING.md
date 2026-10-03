# Treviqo Testing Strategy

## Priority
1. domain rules
2. authorization
3. document pipeline
4. exit workflow
5. mobile critical path

## Unit tests
Required for:
- notice-period comparison
- checklist rules
- benefit portability
- settlement comparison
- pension matching
- parsers/utilities

## Integration tests
Cover:
- database
- auth/ownership
- document metadata
- extraction persistence
- exit-case updates
- reminder creation

## End-to-end critical path
1. sign in
2. create employment
3. upload fixture document
4. review extraction
5. create exit case
6. view checklist
7. review settlement
8. view Passport

## AI testing
Automated suite uses fixture responses.
Keep only a small manual live-AI test set.

## Security tests
- User A cannot access User B employment
- User A cannot access User B document
- signed URLs require authorization
- deleted docs cannot be retrieved
- invalid upload types rejected

## Mobile tests
Check all core screens at common mobile widths and ensure no horizontal overflow.

## Failure tests
- AI unavailable
- upload failure
- malformed extraction
- missing document
- DB conflict
- expired signed URL

## Standard commands
```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Codex must report exactly what it ran.

## Completion report
Every milestone report should include:
- changed files
- migrations
- tests added
- commands run
- failures
- remaining manual checks
- known limitations

## Milestone 0 suites

- `npm test`: environment validation, Argon2 hashing/validation, auth callbacks, owner guard, session serialization boundaries, registration Origin/body validation, rate-limit failure behavior, storage isolation, readiness/liveness.
- `npm run test:integration`: export disposable `DATABASE_URL` and `REDIS_URL`, apply migrations first. Tests actual Argon2 registration, case-insensitive duplicates, valid/invalid credentials, session ownership/expiry/revocation, safe serialization, and Redis rate limits. Removes its synthetic users. Never use production.
- `npx playwright install chromium`, then `npm run test:e2e`: requires the same disposable URLs with migrations applied. Starts an isolated dev server. Tests register/sign-in/reload/sign-out through real application routes, duplicate registration, generic invalid login errors, copied-cookie rejection after logout, CSRF/Origin, safe public session data, protected routes, and navigation/overflow at 320/375/430/1280px. Only the expired-cookie test uses a synthetic cookie. Created test accounts are removed afterward.
- `.github/workflows/ci.yml` supplies disposable PostgreSQL and Redis, applies migrations, and runs all suites plus lint, typecheck, and production build.

Rumpty networking/TLS, private bucket policy, provider backup restore, Argon2 capacity on selected compute, ingress abuse controls, and physical touch-device behavior still require deployment validation. Local tests do not claim that Treviqo is live on Rumpty.

## Milestone 1 additions

- Unit tests: essential-field validation, blank/length/enum rejection, owner-field rejection, leap/invalid calendar dates, end-before-start, same-day employment, unknown dates/types, status grouping, unauthenticated API rejection, Origin/body-size checks, safe error responses.
- PostgreSQL integration: create/read/update, date round trips, owner foreign key, user isolation, rejected ownership reassignment, unchanged data after rejected writes, history ordering. Uses the same disposable service setup as foundation tests.
- Browser tests: signed-in create/view/edit/close/history/cancel at 320/375/430/1280px; save validation/failure/retry; another worker cannot list/read/update a record or load its edit screen; direct unauthenticated pages/APIs reject access. Screenshots are saved under ignored `test-results/`.

Use the existing lint/typecheck/unit/integration/E2E/build commands. Apply all committed migrations before running service/browser tests. No real worker data, Rumpty credentials, or live AI calls are needed.

## Milestone 2 additions

Unit tests cover filenames, object keys, categories, signatures/MIME/extension agreement, bounded streams, limits, and private SDK commands/signing. PostgreSQL tests cover metadata/audit persistence, all ownership boundaries, composite ownership foreign keys, PUT/DB/delete failures, retry, and audit-write failure during signing. Browser tests cover upload/filter/detail/download/delete at 320/375/430px, anonymous/cross-worker/cross-origin denial, invalid/oversized files, and retry.

Playwright starts `tests/fixtures/s3-server.mjs` automatically against synthetic credentials, exercising the actual S3 SDK. The in-memory protocol fixture denies unsigned requests and checks expiration, but does not cryptographically verify signatures or emulate real bucket policy/versioning. Real Rumpty privacy/signature validation remains a deployment check. Never use this fixture as storage for real documents.

`tests/production-smoke.mjs` runs inside the non-root Docker image with disposable DB/Redis. When S3 is configured, mount `tests/` read-only at `/app/tests`; it also tests upload/download/delete/audits through production APIs. A local TLS fixture can use `FIXTURE_TLS_CERT`, `FIXTURE_TLS_KEY`, `FIXTURE_HOST`, and `FIXTURE_PORT`; mount its temporary certificate and set `NODE_EXTRA_CA_CERTS` for local smoke only. Do not disable TLS verification.
