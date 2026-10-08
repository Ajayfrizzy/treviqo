# Rumpty extraction diagnosis — 8 October 2026

Status: application fixes implemented and tested locally with disposable PostgreSQL/Redis and synthetic AI/storage. No commit, push, deployment, production migration, production data access, or live inference was performed for this change. `.env` is unchanged.

## Production evidence and root-cause assessment

A text-based employment contract now reproduces extraction failure in production. The supplied diagnostics are:

- `extraction_output_invalid classification` (earlier: `extraction_output_invalid extraction`)
- `extraction_pipeline_failed result_persistence P2028`
- `extraction_start_failed failure_persistence P2028`
- `extraction_request_failed start P2028`

These identify **two independent failure boundaries**: model-output compatibility and database transaction persistence. A responsive `llama3.2:3b` playground does not establish schema compatibility or application database health. The logs are not request-correlated; a classification exception in the previous code went directly to failure persistence, so the classification and result-persistence lines cannot confidently be assigned to one attempt.

The database design fault was repeated, latency-sensitive interactive transactions for result and failure persistence. Each acquired `EmploymentDocument FOR UPDATE`, read the owned document again, conditionally updated the run, then wrote fields/audit records before committing. Prisma's default interactive transaction timeout is five seconds (default acquisition maxWait is two seconds); network round trips and lock waits consume that budget. The independent failure transaction repeated the same lock/read/write pattern and could fail for the same reason. Recovery was already a **fresh** transaction, not a nested operation on the expired transaction. Provider calls and PDF preparation were already outside database transactions.

**Evidence limit:** P2028 is a transaction API error, not proof of a particular lock wait or timeout. The supplied safe-code logs omit Prisma's detailed reason, elapsed timings and database wait telemetry. Exact production attribution between expiry, acquisition failure and other transaction closure remains unverified. A local integration regression produces a real P2028 with a deliberately shortened transaction timeout, then injects that error at result persistence to verify recovery. This establishes the failure mechanism and recovery behavior without claiming to reproduce Rumpty's latency.

## Transaction changes

`src/modules/extractions/persistence.ts` performs completion/failure as one parameterized PostgreSQL statement with data-modifying CTEs:

1. Check document/employment ownership and lock the document row.
2. Update only the matching processing attempt; ready results require a live two-minute lease.
3. Insert all proposals and an audit event atomically with that transition.

This removes interactive transaction acquisition, client round trips while holding the lock, and the Prisma interactive five-second expiry from result/failure writes. No timeout was increased. Fields and audit events roll back together on constraint/write failure. Late results cannot overwrite a failed, ready or newer run. Lease expiry commits a failed/interrupted transition before returning conflict; it no longer leaves the run processing.

The document lock remains intentional: it orders completion against reservation and document deletion. Eliminating it entirely would reopen a deletion/status race. Reservation retains a short interactive transaction so that its active-run read gets a fresh snapshot **after** acquiring the document lock; a naive single-statement check could miss a concurrent newly committed attempt. Its ownership read and lock are combined into one query. Reservation also audits expired attempts. Review retains its existing atomic optimistic revision/audit transaction and shares the combined ownership/lock query. No AI, storage, parsing or network-provider work occurs inside either transaction.

Failure persistence uses a fresh single statement after result failure, never the failed transaction client. The original run is preserved with the parsing/provider failure category or `persistence` for result-write failures. Content-free diagnostics retain the original category and both safe database codes if recovery also fails. No raw errors, source text, IDs, SQL parameters or provider bodies are logged.

If PostgreSQL is unavailable, no application can durably save a failure category during that outage. Review reads and subsequent starts reconcile expired attempts after recovery. The existing worker now also runs `extraction_cleanup`: bounded batches of 20 eligible attempts, the existing durable outbox/retry policy, and one failed audit per transition. This covers abandoned attempts without user visits. Its sweep runs on the existing one-minute job schedule; actual timing depends on worker availability and backlog. Double-write failures recovered only after lease expiry are marked `interrupted`; original categories remain in safe diagnostics.

## Classification and prompts

`evidence-v4` / `fields-v4` uses a compact classification object with only `type` and `evidence`. The transport sends ordinary chat messages without `response_format`, strict schemas or appended JSON Schema text. Local schema descriptions remain available for tooling; application validation remains authoritative. Output limits stay 256 classification / 2,048 extraction tokens, 25 seconds per provider call and 64 KiB per response.

The parser accepts one complete JSON object inside fences or surrounding prose. It normalizes whitespace, capitalization, spaces/hyphens and an explicit allowlist of equivalent labels (for example `Pay Slip`, `salary-slip`, `final settlement document`). It does not fuzzy-match unknown types, repair incomplete JSON or choose between multiple objects. Unsupported, malformed, ungrounded or ambiguous classification becomes `other` / `needs_review`, pausing type-specific extraction until the user selects a type. Known explicit low-confidence legacy answers also pause. Grounded recognized categories receive application-assigned medium confidence and remain unconfirmed proposals.

Extraction prompts retain one compact example, allowed field labels, the untrusted-document boundary and pension-specific restrictions. Repeated verbose schema text is removed; token limits were not raised. No additional inference call, automated paid retry, model switch or provider fallback was added.

## Partial extraction policy

Sparse arrays and legacy field objects are evaluated proposal by proposal. Retained values must:

- use a supported key for the selected type;
- satisfy value/evidence length and type constraints;
- include evidence occurring in the source after whitespace normalization;
- occur inside that evidence excerpt.

Malformed cells, unsupported keys, missing/invented evidence, mismatched values and duplicated keys are discarded. All proposals for a duplicated key are omitted rather than arbitrarily choosing a conflicting value. Pension completeness remains user-assessed; AI completeness assertions cannot become proposals. Missing fields stay null and remain available for manual correction.

Six valid and two invalid proposals produce six retained proposals, status `ready`, and existing `errorCode` value `partial`. The review screen explains that some suggestions were omitted. This additive use of the existing metadata column needs **no database migration**. It does not mean every fact in the document was found: omitted sparse fields do not themselves establish model error. Zero usable grounded field proposals produces `failed` / `malformed` with manual entry still available. Classification-only Other is a ready review requiring user selection, not a claim of successful field extraction. No value is automatically confirmed.

## Validation

All database/browser commands explicitly used disposable loopback PostgreSQL and Redis, with all 11 existing migrations applied locally. No production URL or credentials were used.

- `npm run validate`: lint, TypeScript, **289 unit tests**, production Next.js build and worker build passed.
- `npm run test:integration`: **114 tests passed**, including **23 extraction integration tests**.
- `npm run test:e2e -- tests/e2e/extractions.spec.ts`: **10 passed**, including existing 320/375/430/768/1440px review flows and partial/ambiguous/manual fallback at 320/1440px.
- `npm run test:e2e`: **90 passed** (5.3 minutes), including shared worker reminders/account deletion and navigation.
- Final `npm run lint && npm run typecheck`, targeted Prettier checks, `node --check scripts/rumpty-ai-stages.mjs`, and `git diff --check`: passed.

New tests cover fenced/prose/case/alias classification, malformed/ambiguous/ungrounded classification, independently valid proposals, unsupported/malformed/missing evidence, conflicting duplicates, zero grounded fields, real P2028 recovery, failed recovery followed by expiry reconciliation, atomic rollback, inference without held document locks, simultaneous reservation, lease expiry during a document-lock wait, stale and late completions, worker expiry and actual job dispatch and unconfirmed partial proposals. Existing authorization, deletion-during-inference, review revision, audit rollback and manual fallback checks remain active.

Initial failure-injection tests intercepted reservation instead of result persistence; injection now begins only after reservation, during the fixture AI call. Those tests passed after correction. Browser tests emitted development-server warnings, including an early-closed navigation stream, but extraction assertions passed. The standalone production smoke's expected schema version was updated; that TLS smoke was not separately rerun in this change.

## Remaining Rumpty/model checks

- Confirm the deployed revision and collect transaction timing/wait details for any residual P2028, especially reservation/review. No exact production lock/latency cause is claimed without that evidence.
- Run explicitly authorized synthetic hosted acceptance after deployment. Local fixtures cannot establish llama3.2:3b evidence accuracy, Rumpty ingress budgets, or real database latency.
- Earlier live diagnostics (7 October) found that accepted `json_object`/`json_schema` requests did not reliably enforce output shape, a max_tokens request was not respected, and some extraction responses omitted evidence. The new parser tolerates harmless formatting but still cannot accept missing evidence or validate semantic correctness solely from substring grounding.
- Deploy matching web and worker artifacts together when separately authorized. The worker is needed for unattended expiry cleanup. No schema migration is added by this change.

## Changed files and handoff

- `src/modules/extractions/persistence.ts` (new), `service.ts`: atomic lifecycle persistence, reservation/read expiry, recovery diagnostics and worker reaper.
- `src/modules/extractions/schema.ts`, `prompts.ts`, `shared.ts`: tolerant classification, individually validated proposals, compact prompts and safe persistence-failure guidance.
- `src/server/ai/client.ts`: plain-chat compatibility without provider structured-output requirements.
- `src/server/jobs/queue.ts`, `runner.ts`: extraction expiry job using the existing scheduler.
- `src/components/extraction-review.tsx`: partial-result explanation; existing manual/review actions remain.
- `tests/extraction.test.ts`, `extractions.integration.test.ts`, `ai-client.test.ts`, `jobs.integration.test.ts`, `e2e/extractions.spec.ts`, `fixtures/ai-server.mjs`: regression coverage and synthetic protocol variations.
- `scripts/rumpty-ai-stages.mjs`: synthetic acceptance now uses the application's tolerant parser, while still requiring all expected values and no dropped proposals for accuracy acceptance. Not run against Rumpty.
- `tests/extraction-production-smoke.mjs`: expected schema version updated; not separately executed.
- This report, `docs/ai/AI_DOCUMENTS.md`, `docs/testing/TESTING.md`: current contracts, verification and remaining checks.

No migration, dependency or environment change was introduced. Disposable test
containers were removed after validation. Physical-device and hosted Rumpty checks
remain manual follow-up; browser responsive checks are local automated evidence.
