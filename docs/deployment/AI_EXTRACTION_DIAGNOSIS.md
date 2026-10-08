# Rumpty extraction diagnosis — 8 October 2026

Status: compact extraction/salvage and attempt-history changes implemented. Latest user-supplied production diagnostics still show `extraction_output_invalid extraction` with zero grounded usable fields; **P2028 is no longer appearing in that latest live test**. This is evidence of separate progress, not proof that every production database failure is resolved. Local validation below uses only disposable PostgreSQL/Redis and synthetic AI/storage. No commit, push, deployment, production data change or live inference was performed. `.env` is unchanged.

## Latest extraction follow-up

The earlier v4 parser required an object wrapper, did not recognize field-name capitalization/aliases, and discarded every duplicate key, even identical grounded duplicates. It also failed to mark a sparse single valid proposal partial unless another proposal was explicitly rejected. These constraints could discard otherwise usable small-model output. The safe production diagnostics do not reveal the raw output, so they cannot establish which specific shape/evidence defect caused the observed zero-field failure.

`evidence-v5` / `fields-v5` now uses shorter extraction instructions, a canonical type-specific key list and **one concise example per type**. The model is asked to copy values and their containing source excerpts, omit facts it cannot ground, and never infer missing values. Confidence is not requested; every newly parsed field receives `needs_review` in the application. The pension prompt preserves separate rows, posting-date versus contribution-period semantics and identifier restrictions, and no longer lists the user-only completeness key. Provider schema enforcement remains disabled. Token limits and timeouts are unchanged.

Bounded salvage accepts one complete JSON object or array inside fences/prose. Supported shapes are `{fields:[...]}`, a top-level proposal array, `{fields:{key,value,evidence}}`, a single proposal object, and legacy keyed cells. Structural property capitalization, whitespace, camel case and equivalent field names are normalized. The explicit alias list is limited to employer_name → employer, employee_name → employee, and job_title/role_title → role, and every result still must belong to the selected type. No fuzzy matching or guessed field/value relationship is used.

Duplicate proposals with the same normalized, grounded value are retained once. Different grounded values for one canonical key cause that key to be omitted; invalid duplicates cannot poison an independently valid proposal. Semantically malformed entries are dropped individually. Truncated/broken JSON syntax, competing top-level structures, conflicting normalized property names, nesting beyond 12 levels, more than 100 candidates or output beyond 65,536 characters (with the transport still capped at 64 KiB) fail closed. Delimiters, values and evidence are never fabricated.

A usable result is `ready` with `errorCode=partial` when proposals were dropped **or fewer than the type's extractable keys have grounded values**. Thus one valid field is explicitly partial. Partial describes limited coverage, not proof that the document contains every omitted field. All values stay proposed and unconfirmed. Zero valid fields remains failed, with explicit retry and manual entry. Retries use the same deterministic prompt; no automatic paid retry or rate-limit change was introduced. Prior attempts remain stored.

## Attempt-history UX

The previous selector made all failed attempts prominent. During POST, the previous record also remained mounted while the form was disabled, making it look like the result of the newly running attempt. The UI now separates local new-request state from the last stored record:

- Latest status is shown by default; previous attempts are inside a collapsed **View previous attempts** disclosure.
- Entries use concise status/date labels in Africa/Lagos time (WAT). Older attempts can still be inspected and reviewed, with an explicit Previous attempt label and Return to current attempt action.
- A new POST immediately hides the old status/fields and shows **Extracting details… / This may take up to 90 seconds.** The old attempt becomes history while the request is pending.
- Partial output shows **Some details were extracted**, verification guidance and editable missing fields.
- Current unverifiable output shows **Extraction failed** with retry/manual-entry guidance. Other failures retain their useful provider, timeout or storage-specific guidance.
- If the request outcome is uncertain, a refresh instruction is shown instead of restoring the old failure as the new result. Refresh reads actual server state; there is no automatic retry.
- A request guard prevents overlapping actions. Loading another attempt or saving a review does not pretend a new extraction started.

## Earlier transaction diagnosis (retained)

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

The preceding `evidence-v4` / `fields-v4` change introduced a compact classification object with only `type` and `evidence`. The transport sends ordinary chat messages without `response_format`, strict schemas or appended JSON Schema text. Local schema descriptions remain available for tooling; application validation remains authoritative. Output limits stay 256 classification / 2,048 extraction tokens, 25 seconds per provider call and 64 KiB per response.

The parser accepts one complete JSON object inside fences or surrounding prose. It normalizes whitespace, capitalization, spaces/hyphens and an explicit allowlist of equivalent labels (for example `Pay Slip`, `salary-slip`, `final settlement document`). It does not fuzzy-match unknown types, repair incomplete JSON or choose between multiple objects. Unsupported, malformed, ungrounded or ambiguous classification becomes `other` / `needs_review`, pausing type-specific extraction until the user selects a type. Known explicit low-confidence legacy answers also pause. Grounded recognized categories receive application-assigned medium confidence and remain unconfirmed proposals.

Extraction prompts retain one compact example, allowed field labels, the untrusted-document boundary and pension-specific restrictions. Repeated verbose schema text is removed; token limits were not raised. No additional inference call, automated paid retry, model switch or provider fallback was added.

## Partial extraction policy

Sparse arrays and legacy field objects are evaluated proposal by proposal. Retained values must:

- use a supported key for the selected type;
- satisfy value/evidence length and type constraints;
- include evidence occurring in the source after whitespace normalization;
- occur inside that evidence excerpt.

Malformed cells, unsupported keys, missing/invented evidence and mismatched values are discarded. Duplicate handling follows the v5 policy above. Pension completeness remains user-assessed; AI completeness assertions cannot become proposals. Missing fields stay null and remain available for manual correction.

Six valid and two invalid proposals produce six retained proposals, status `ready`, and existing `errorCode` value `partial`. The review screen explains that some suggestions were omitted. This additive use of the existing metadata column needs **no database migration**. It does not mean every fact in the document was found; absent sparse fields now also mark limited coverage as partial, without establishing a model error. Zero usable grounded field proposals produces `failed` / `malformed` with manual entry still available. Classification-only Other is a ready review requiring user selection, not a claim of successful field extraction. No value is automatically confirmed.

## Validation for this follow-up

All database/browser commands explicitly target disposable loopback PostgreSQL/Redis with the 11 existing migrations applied locally. No migration was added.

- `npm run validate`: lint, TypeScript, **316 unit tests**, production Next.js build and worker build passed.
- `npm run test:integration -- tests/extractions.integration.test.ts`: **27 passed**.
- `npm run test:e2e -- tests/e2e/extractions.spec.ts`: **15 passed**, including existing review flows at 320/375/430/768/1440px and new history/retry checks at 320/375/430/1440px.
- `npm run test:e2e -- tests/e2e/extractions.spec.ts --grep 'attempt history stays secondary'`: **4 passed** after the final spacing adjustment.
- `npm run lint && npm run typecheck`, targeted Prettier checks and `git diff --check`: passed.

Coverage includes compact JSON, fenced/prose-wrapped arrays, singleton salvage, normalized keys, identical/conflicting duplicates, independently malformed cells, unsupported keys, empty/inferred values, missing/ungrounded evidence, bounded/ambiguous output, one-field partial persistence, zero-field failure, proposed-only values, deterministic explicit retries and preserved attempts. Existing transaction, ownership, audit, lease and concurrency tests remain active.

Browser additions cover collapsed history, current versus historical selection, immediate new-request state without stale failure, salvaged partial output, request-error recovery and manual entry at mobile/desktop widths. No live model inference is used, and live extraction success is not claimed. The browser suite emits expected `extraction_output_invalid extraction` diagnostics for deliberately malformed fixture responses. No test failures remained. Full unrelated browser/integration suites and standalone production TLS smoke were not rerun in this focused follow-up.

## Remaining Rumpty/model checks

- Confirm the deployed revision and collect transaction timing/wait details for any residual P2028, especially reservation/review. No exact production lock/latency cause is claimed without that evidence.
- Run explicitly authorized synthetic hosted acceptance after deployment. Local fixtures cannot establish llama3.2:3b evidence accuracy, Rumpty ingress budgets, or real database latency.
- Earlier live diagnostics (7 October) found that accepted `json_object`/`json_schema` requests did not reliably enforce output shape, a max_tokens request was not respected, and some extraction responses omitted evidence. The new parser tolerates harmless formatting but still cannot accept missing evidence or validate semantic correctness solely from substring grounding.
- Deploy matching web and worker artifacts together when separately authorized. The worker is needed for unattended expiry cleanup. No schema migration is added by this change.

## Changed files and handoff for this follow-up

- `src/modules/extractions/schema.ts`, `prompts.ts`, `shared.ts`: bounded salvage, canonicalization/duplicates, partial coverage, shorter prompts, versioned metadata and failed-result copy.
- `src/components/extraction-review.tsx`, `src/app/globals.css`: collapsed history, spaced mobile history actions, explicit current/historical selection, processing and uncertain-outcome states.
- `tests/extraction.test.ts`, `extractions.integration.test.ts`, `e2e/extractions.spec.ts`, `fixtures/ai-server.mjs`: parser, persistence/retry and browser regressions.
- `tests/extraction-production-smoke.mjs`: expected version updated to fields-v5; standalone TLS smoke not separately executed.
- This report, `docs/ui/UI_UX.md`, `docs/ai/AI_DOCUMENTS.md`: updated contracts, UI behavior and remaining limitations.

The persistence implementation, worker expiry job, ownership rules and rate limits
are unchanged in this follow-up. No dependency or environment change was introduced.
Physical-device checks and hosted Rumpty acceptance remain manual follow-up.

Mobile screenshots were inspected at 320px. The pending state clearly replaces the
old failure. The first history inspection identified touching buttons/default
bullets; spacing and list styling were corrected and responsive checks rerun.

Disposable local test containers were removed after validation.
