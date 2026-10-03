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

## Milestone 3 additions

`tests/fixtures/intelligence` contains synthetic JSON and real text PDFs for contracts, payslips, resignation letters, and termination letters. Unit tests cover real local parsing, strict schemas, grounding, unknowns, protocol/body bounds, malformed/truncated output, environment completeness, and unreadable content. Integration tests cover proposed/reviewed persistence, ownership, audit atomicity, immutable proposals/history, stale revisions, manual fallback, malformed/unavailable inference, low-confidence classification, retry preservation, processing leases, and deletion during inference.

Playwright starts an additional local AI protocol fixture and runs actual PDF preparation and HTTP inference through the app. Review scenarios cover 320/375/430px, confirmation/correction/rejection/unknown, refresh persistence, failure/retry/manual entry, and cross-worker/cross-origin/unauthenticated rejection. No suite calls live Rumpty inference or requires AI credentials.

The Docker smoke optionally exercises intelligence when RUMPTY_AI_BASE_URL is configured: the actual traced PDF subprocess, S3 read, TLS inference HTTP, review confirmation, and deletion of derived data. `tests/fixtures/ai-server.mjs` supports AI_FIXTURE_TLS_CERT/KEY/HOST/PORT for local TLS smoke only. Do not use fixture servers with real documents or as deployed services. Run live Rumpty synthetic accuracy/protocol checks separately before launch.

## Milestone 4 additions

`tests/exit-rules.test.ts` covers all nine material rules, five exit types, each relevant state branch, unknown/missing/ambiguous inputs, stale evidence versions, and calendar date boundaries (same day, leap days, month ends, year rollover, supported bounds). The rules do not call AI.

`tests/exits.integration.test.ts` covers all types, case/audit persistence, unchanged employment, user and same-user/different-employment evidence isolation, PostgreSQL ownership constraints, concurrent duplicate creation, optimistic updates, audit rollback, proposed-vs-confirmed extraction eligibility, review changes/rejection, and deleted evidence. `tests/e2e/exits.spec.ts` covers four-step creation/editing, all five states, save-and-return/cancel, empty/error/retry, all five types, API/page ownership, unauthenticated/Origin/strict-input boundaries, and 320/375/430px layout checks.

The production smoke now also creates an exit case, checks nine rules, updates notice dates, rejects stale edits, verifies audits, and checks logout revocation at the exit API. It needs only disposable PostgreSQL/Redis for this portion; storage and inference smoke remain optional when configured.
