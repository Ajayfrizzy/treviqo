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

## Milestone 5 additions

`tests/finance-rules.test.ts` covers exact minor-unit amounts, currency/precision/period ambiguity, missing/stale/duplicate settlement evidence, pension coverage/completeness, separate employee/employer amounts, late postings, unknown/multiple/partial rows, employer matching and zero contributions. PostgreSQL tests cover all owner boundaries, source eligibility, optimistic conflicts, audit rollback, stale/rejected/deleted evidence, pension confirmation tokens, lifecycle idempotence and follow-up persistence.

`tests/e2e/finance.spec.ts` uses real registration, private PDF upload, fixture HTTP extraction and review routes for payslip/settlement/pension sources. It checks comparison/editing, explicit pension confirmation, stale evidence, error/retry, authentication/Origin/ownership/body limits and 320/375/430px overflow. Fixture JSON/PDFs and the local AI server now support all six extraction types.

The production smoke extends its TLS storage/inference path to settlement comparison, pension matching/confirmation, and invalidation after deleting source documents. See [Milestone 5 validation record](../milestones/SETTLEMENT_PENSION.md) for commands/results and remaining real-provider checks.

## Milestone 6 additions

Passport unit tests cover default Unknown across all categories, evidence/context validity, masking, provider conflicts and date uncertainty. Integration tests cover derived closed entries, ownership/source isolation, composite keys, worker assessment CRUD/audits, concurrent creates, optimistic conflicts, audit rollback, rejected/deleted/changed sources, reopened employment and current finance-derived pension confirmation. Shared-database integration files run sequentially to avoid incidental PostgreSQL Serializable predicate-lock conflicts; explicit concurrency tests remain active.

Passport browser journeys cover real sign-in, private upload/manual field review, timeline/detail, distinct provenance labels, assessment/cancel/error/retry, identifier masking, deletion/reopening and 320/375/430px overflow. Full regression suites retain earlier milestones. Production Docker smoke adds live Passport derivation, current pension confirmation, benefit assessment/audit and stale-evidence invalidation. See [Milestone 6 exact results](../milestones/BENEFIT_PASSPORT.md).

## Milestone 7 implementation

Milestone 7 adds pure reminder/date/fingerprint and rate-limit tests; real PostgreSQL/Redis jobs tests cover retries, leases, concurrent workers, lost queue recovery, batch cursors, atomic audits, ownership, snooze and 501-session cleanup. Browser tests at 320/375/430 pixels invoke the compiled worker and exercise live reminders, failure/retry and source resolution. `npm run validate` now builds the worker; `npm run test:e2e` compiles it before Playwright. Run suites sequentially against a disposable database, then run the production web/worker smoke using TLS fixtures. See [validation report](../milestones/REMINDERS_RELIABILITY_SECURITY.md#validation).

## Production UI polish coverage

Responsive browser journeys now cover 320/375/430/768/1440px across employment, vault, extraction, Exit, finance, Passport and reminders; auth/shell and employment also cover 1024/1280px. `polish.spec.ts` exercises eight-character registration through the real server, password-manager attributes, first-use navigation, safe Profile content and logout, saving screenshots for each width. Foundation coverage adds visible password feedback/reveal, inline validation/focus and unavailable-registration recovery. Password unit tests cover each requirement and 8/128-character boundaries. Integration coverage proves existing passphrase accounts still authenticate. `ui-request.test.ts` checks stalled response-body timeout, uncertain-save guidance, no automatic retry, and preserved API validation responses. All service/browser runs use disposable local PostgreSQL/Redis and synthetic S3/AI fixtures.

## Interaction feedback follow-up

Employment browser checks assert equal-width Save/Cancel controls, a shared background with distinct Cancel border, and at least 12px spacing at 320/375/430/768/1024/1280/1440px. Extraction tests hold requests open to verify the clicked button's busy state, disabled repeat-click protection, one request per action, recovery after a failed save, and successful retry. They also verify that original excerpts remain visible while technical model/prompt/schema UI is absent. A delayed navigation test verifies immediate pending feedback and an accessible shell until the destination loads.

## Scheduled account deletion

`account-deletion.test.ts` covers strict confirmation/ownership input, authentication,
Origin/body limits, cookie clearing and redacted scheduling errors. Storage unit
checks cover unversioned HEAD/DELETE/HEAD (including already-absent keys), explicit
versioned purge, retained files and provider failures. `sign-in-state.test.ts`
covers generic credential errors versus infrastructure errors and exact deadlines.

`account-deletion.integration.test.ts` uses real Argon2/PostgreSQL for scheduling,
revocation, disabled sessions/uploads, credential-gated pending state, cancellation,
deadlines, all child tables, cross-user isolation, batches/checkpoints, transaction
rollback, upload locking and retry backoff. `tests/e2e/account-deletion.spec.ts`
checks Profile scheduling/cancellation at 320/375/430/1440px, wrong-password privacy,
revoked copied sessions, the compiled worker's deadline gate and synthetic S3
AccessDenied recovery, plus Origin/target-user rejection and sign-in errors.

Use disposable PostgreSQL/Redis after all migrations, with synthetic S3/AI fixtures.
`tests/account-deletion-production-smoke.mjs` now exercises scheduling plus worker
cleanup and requires `node --conditions=react-server` and a built worker. Never run
it against live accounts or storage. The smoke retains its loopback/database guard.

## Navigation performance

`tests/e2e/navigation.spec.ts` checks tab navigation at 375/1440px, employment
creation/closure followed by fresh Home/Documents/Passport screens, and sign-out.
It attaches per-tab click-to-heading timings (including browser automation overhead).
The normal browser suite runs this journey in development mode.

For actual production prefetch coverage, build first, then use disposable local
PostgreSQL/Redis with all migrations applied:

```sh
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout /tmp/treviqo-nav-test.key -out /tmp/treviqo-nav-test.crt \
  -days 1 -subj /CN=127.0.0.1 -addext 'subjectAltName=IP:127.0.0.1'
NAVIGATION_TLS_KEY=/tmp/treviqo-nav-test.key \
NAVIGATION_TLS_CERT=/tmp/treviqo-nav-test.crt \
  npx playwright test --config playwright.navigation.config.ts --reporter=list,json
```

Export disposable `DATABASE_URL` and `REDIS_URL` before running. The production
configuration starts the actual standalone build on 3110 and a loopback-only TLS
proxy on 3443. Only the test browser accepts the generated self-signed certificate;
application TLS validation remains intact. Storage and AI are disabled for this
navigation-only journey. Use Playwright's JSON reporter to retain timing attachments.
These local timings do not represent Rumpty network/database latency.

The production prefetch assertion allows 15 seconds independently of tab-switch
measurements. It reports missing destination paths and attaches request status,
observed byte counts, stream-observation errors, and request failures. Buffered
response bytes are assembled before live chunks, with incremental UTF-8 decoding;
`tests/prefetch-stream.test.ts` covers the arrival-order race and split characters.
CI uploads `navigation-production` artifacts before the development suite can
clear the results directory, including failure traces/screenshots and JSON results.

To check reliability, run the production command with `--repeat-each=3`. Repeat
with `NAVIGATION_SLOW_NETWORK=1` to add 100 ms latency and limit download/upload
to 200/100 KiB per second during sign-in and prefetch observation. No automatic
retries are enabled, and all navigation, freshness, and logout assertions remain.

## Extraction compatibility and persistence follow-up

`extraction.test.ts` covers minimal classification, fences/prose/aliases,
ambiguity, partial grounded proposals, malformed/unsupported/missing-evidence
cells, duplicate keys and zero usable fields. `extractions.integration.test.ts`
adds real Prisma expiration injected after reservation, fresh failure persistence,
double-failure recovery, atomic constraint rollback, concurrent/expired attempts,
no document lock held across inference, and unattended worker expiry. Browser
extraction checks add partial results and manual fallback at 320/1440px.

Use disposable PostgreSQL/Redis and fixture AI/storage for all checks. Run
`npm run validate`, `npm run test:integration`, and `npm run test:e2e`. The worker
now includes `extraction_cleanup` alongside the existing jobs; keep scheduler tests
independent of unrelated job ordering. See the [diagnosis report](../deployment/AI_EXTRACTION_DIAGNOSIS.md)
for exact results and remaining live acceptance requirements.
