# Treviqo AI Document Processing

## Current implementation

This section is authoritative for the current source; dated protocol notes below are historical. Eight extraction/manual-review categories are defined in [shared.ts](../../src/modules/extractions/shared.ts): employment contract, payslip, resignation letter, termination letter, exit letter, final settlement, pension statement and benefit document. Reimbursement evidence and Other can be stored but do not have separate extraction schemas.

The [Rumpty adapter](../../src/server/ai/client.ts) sends ordinary non-streaming chat completions with temperature zero, system/user messages and bounded output. It sends no `response_format`, tools or provider-enforced JSON schema. Application parsing/grounding is authoritative. Classification requests 256 output tokens; extraction requests 2048. `RUMPTY_AI_TIMEOUT_MS` defaults to 60000 ms and allows 10000–90000 per call. The response cap is 64 KiB. Extraction attempts and browser waits allow four minutes. There is no automatic paid retry or fallback inference provider.

PDF text preparation runs in a bounded local subprocess. Images/scans require transcription or manual fields; OCR is not implemented. Source text is untrusted data. Explicit type selection and distinctive document-purpose anchors avoid confusing benefit, payslip, pension and exit-letter schemas. Ambiguous categories pause for user selection. Narrow source-label/row recovery may retain unambiguous facts when model extraction is incomplete; it does not infer missing values or confirm them.

Proposals contain a supported key, verbatim value and a source excerpt containing that value. Bounded parsing accepts supported harmless formatting variants and rejects ambiguity, malformed structure and ungrounded claims. Source recovery uses the same validation and review rules. Gross/net salary and employee/employer pension amounts remain distinct. Pension extraction supports at most three rows; completeness is user-assessed, never inferred by AI. Account/RSA identifiers are not requested.

Original proposals and review revisions are preserved. Confirmed/Corrected fields can be selected as reviewed evidence; Proposed, Rejected and Unknown are not trusted facts. Classification confirmation is separate from field confirmation. Extraction never silently updates employment dates, selected exit type, portability or contribution confirmation. Semantic correctness still requires reading the original document.

Review supports current results, partial/manual fields, prior attempts, correction history and retry. Expired runs are recovered by service reads/starts and the existing `extraction_cleanup` worker job. Current version constants live in [schema.ts](../../src/modules/extractions/schema.ts); do not use older version descriptions below to configure a deployment. Provider compatibility investigations remain in [the diagnosis record](../archive/investigations/AI_EXTRACTION_DIAGNOSIS.md).

## Historical design and evolution

The initial field lists and milestone/protocol descriptions below record design evolution. They do not broaden today's supported types, trust policy, timing or identifier collection beyond the current contract above.

## Principle

Rumpty AI performs narrow document-understanding tasks.
It is not the legal or business decision-maker.

## Initial types

- employment contract
- payslip
- resignation letter
- termination letter
- exit letter
- pension statement
- final-settlement document
- reimbursement/expense evidence
- benefit document
- other

## Pipeline

```text
Upload
 -> validate
 -> private storage
 -> prepare readable content
 -> classify
 -> type-specific extraction
 -> validate schema
 -> store proposed extraction
 -> user review/correction/confirmation
```

## Prompt rules

- one narrow purpose
- strict JSON
- explicit schema
- return null when absent
- no unsupported inference
- no broad legal interpretation
- short prompts where possible
- grounded only in supplied content

## Contract fields

- employer
- employee if present
- role
- start date
- employment type
- salary amount/frequency
- notice period
- annual leave
- probation
- pension references
- HMO references
- group-life references
- relevant exit-clause snippets

## Payslip fields

- employer
- employee
- pay period
- gross/net pay
- basic salary
- pension deduction
- tax
- other deductions
- explicit reimbursements/allowances

## Resignation fields

- letter date
- notice date
- proposed last day
- stated notice period
- reason if explicit

## Termination fields

- letter date
- effective date
- stated reason
- notice/pay-in-lieu wording
- settlement references
- benefit termination references

Never classify lawfulness.

## Pension statement fields

- PFA/provider
- identifiers excluded from the implemented pension schema
- statement period
- contributions
- contribution dates
- employer names
- employee/employer contribution values where distinguishable

## Final settlement fields

- pay period
- final salary
- leave settlement
- reimbursement
- bonus/commission
- pension deduction
- loan deductions
- other deductions
- total settlement

## Confidence

Use:

- high
- medium
- low
- needs_review

## User confirmation

Allow:

- confirm
- edit
- reject
- mark unknown

Store original proposed value plus confirmed/corrected value.

## Fixtures

Create synthetic fixtures for contracts, payslips, resignation letters, pension statements, and final settlements.
Automated tests should not repeatedly consume live inference credits.

## Versioning

Record model, prompt/schema version, and extraction timestamp.

## Milestone 3 implementation

At Milestone 3, implemented types were limited to employment contracts, payslips, resignation letters, and termination letters. Milestone 5 adds pension and settlement schemas below; benefit and other extraction remain future work. Classification returns one supported type or Other; low/needs-review confidence pauses extraction until the worker selects a type. An explicitly selected type bypasses AI classification. It never silently changes the uploaded document category.

The provider contract is `DocumentAI.complete(InferenceTask)` in `src/server/ai/client.ts`. No executable AI adapter existed in Milestones 0–2. The new adapter implements an isolated OpenAI-compatible `POST {RUMPTY_AI_BASE_URL}/chat/completions` transport with explicit configured Rumpty model/key, temperature zero, JSON-object mode, 4096 output tokens, no tools/redirects/streaming, a 25-second deadline per call, and a 64 KiB response limit. This protocol assumption needs live Rumpty verification; there is no fallback provider. Provider error bodies are not logged or persisted.

Classification and extraction are separate narrow calls. `evidence-v1` prompts and `fields-v1` Zod schemas are recorded per attempt together with model and timestamps. Each type has a fixed set of named fields (see `src/modules/extractions/shared.ts`); values are nullable verbatim strings with evidence and confidence. Original date/amount/currency wording is preserved, not normalized or calculated. There are no entitlement/readiness/legal outputs. Prompts treat document text as untrusted content and explicitly ignore instructions embedded in it. No model tools execute document instructions.

Strict schema validation rejects extra/missing keys, invalid enums, wrong types, malformed/truncated responses, and unsupported classifications. Evidence is whitespace-normalized and must occur in prepared source text; each non-null value must occur inside its evidence excerpt. Unsupported field proposals become null/Needs review. This catches unsupported text but cannot prove that the model selected the correct semantic field. Every field, even High confidence, starts Proposed with no trusted value.

PDF text is extracted locally with `unpdf` in a disposable Node subprocess (10-second timeout, 128 MiB V8 heap limit, sanitized environment, no parser logs). Input is bounded to the vault maximum 20 MiB and checked against its stored SHA-256. Preparation accepts up to 30 pages and 18,000 characters, rejecting longer sources without silent truncation. Scanned/encrypted/corrupt/blank PDFs and images fall back to user transcription or manual entry; no OCR/vision provider is assumed. Transcriptions are labelled separately and are not verified against the uploaded bytes. Full prepared text is not persisted; a source hash and selected excerpts retain provenance.

The owner explicitly starts extraction. Attempts persist independently of document Ready state, retain previous attempts/reviews, and never overwrite trusted fields. Synchronous requests have bounded work; a per-document database lock reserves a two-minute processing lease. Concurrent starts reject; stale attempts can be retried after two minutes. Redis allows 10 starts per worker per 10 minutes, including manual attempts, and fails closed. There is no automatic paid retry or new queue/worker service in this milestone.

Review offers Confirm proposal, Save correction, Reject, and Mark unknown. Null proposals cannot be confirmed. Every change preserves the original proposal and adds a revision with an optimistic version check. Confirmed/Corrected alone carry reviewed values. Unknown/Rejected clear them. No reviewed values are copied into employment records. Milestones 4–5 consume explicitly selected reviewed evidence in deterministic rules. Classification corrections are recorded separately from upload categories; start another attempt with the correct type for a different field schema.

Synthetic JSON and real text-PDF fixtures cover all four types. The local protocol server exercises actual HTTP inference transport in browser and Docker tests; it measures integration behavior, not real model quality. Live model evaluation on synthetic documents is a required deployment check.

## Milestone 5 extraction extension

The supported set now adds final settlements and pension statements. New attempts record `evidence-v2` / `fields-v2`; existing attempts retain historical versions. Settlement uses the nine fields listed above. Pension uses provider, coverage start/end, worker completeness, and three separate rows with employer, contribution month, posting date, employee contribution and employer contribution. No identifiers are requested.

The model must never sum rows, infer contribution month from posting date, or assert extract completeness. Parsing forcibly discards any AI completeness assertion; the worker must correct that field to Yes after reviewing all entries. Larger statements require a narrower source or clarification. Verbatim extracted dates/amounts may need user correction to YYYY-MM, YYYY-MM-DD and explicit currency amounts before deterministic matching. All trust, versioning, grounding, confidence, retry, and manual fallback controls remain in the existing pipeline. Fixtures now cover six types; no live inference is required by tests.

## October 7 production extraction diagnosis

The October 7 candidate used `evidence-v3` / `fields-v3`: a bounded sparse list of present `{key,value,evidence}` facts, expanded server-side to all review fields. Unknown/duplicate keys and missing evidence fail validation. Every sparse proposal starts `needs_review` / Proposed; no value becomes trusted automatically. Legacy complete cell responses retain strict validation. Classification requests 256 output tokens, extraction 2048, with a configurable bounded deadline (see below) and 64 KiB response cap. At that date, live Rumpty did not reliably honor JSON structure/evidence requirements; manual entry remained necessary on failure. See [measured compatibility, failure-path analysis and validation](../archive/investigations/AI_EXTRACTION_DIAGNOSIS.md). Earlier milestone protocol descriptions are historical.

## 8 October 2026 compatibility and persistence update

The October 8 protocol was `evidence-v4` / `fields-v4`; this supersedes earlier
strict-response and all-or-nothing parsing descriptions above. Classification
asks only for type/evidence through ordinary chat messages, without provider
structured-output options or appended schema text. One fenced/prose-wrapped JSON
object and explicit equivalent labels are recoverable; ambiguity pauses as
Other / Needs review. Grounding remains mandatory.

Field parsing retains independently valid grounded proposals and drops invalid
ones. Ready attempts with dropped proposals carry `errorCode=partial` and visible
review guidance; zero usable proposals fail with manual entry available. Missing
fields remain null. Nothing is automatically confirmed. The existing metadata
column is reused, so there is no schema migration.

Result/failure writes are atomic PostgreSQL statements outside interactive
transactions. Ownership, document locking, live leases and audit atomicity remain.
Expired attempts are reconciled on read/start and by the existing worker's new
`extraction_cleanup` job. See the [historical diagnosis and validation report](../archive/investigations/AI_EXTRACTION_DIAGNOSIS.md)
for evidence, limitations and production follow-up.

## Compact extraction and salvage follow-up (v5)

That follow-up recorded `evidence-v5` / `fields-v5`. Extraction uses a shorter key list
and one type-specific example, with verbatim value/evidence and omission instructions.
It does not request confidence or use provider schema enforcement. All new parsed
fields receive application-assigned `needs_review`; trusted values still require
explicit user confirmation/correction.

The parser recovers complete object/array JSON from fences/prose, singleton proposals
and singleton fields wrappers. It normalizes key capitalization/whitespace/camel case
and a small explicit alias list before enforcing the selected type's allowlist.
Matching grounded duplicates are deduplicated; conflicting grounded values for one
key are omitted. Invalid entries do not discard independent valid fields. It never
repairs incomplete JSON or invents values/evidence. Bounded input, exact grounding,
pension completeness restrictions and manual fallback remain mandatory.

Partial now includes limited coverage as well as rejected proposals. One usable field
is saved ready/partial, with all other review fields null. Zero usable fields remains
failed. Retries are explicit, deterministic, rate limited and preserve history. See
[the historical diagnosis](../archive/investigations/AI_EXTRACTION_DIAGNOSIS.md) and
[attempt-history UX](../ui/UI_UX.md) for current behavior and validation.

## Review context correction (UI only)

Persisted failures are historical on initial load, not active extraction state.
Only processing records or a newly started interaction use the active attempt UI;
saved successful/manual data is labelled Latest result. Historical selection uses
its own loading state and Previous attempt label. Back to latest restores the
previous context. A component-local cache avoids repeated reads of terminal history
records; late reads cannot replace newer interactions. All stored attempts remain
available through collapsed history. See [the state model](../ui/UI_UX.md#extraction-review-context--8-october-2026).

This correction changes no prompts, parser, persistence, APIs, rate limits or AI
behavior. Protocol versions remain evidence-v5 / fields-v5.

## Bounded inference timing

`RUMPTY_AI_TIMEOUT_MS` defaults to 60000; accepted values are integers from
10000 through 90000. Classification and extraction each receive this bound,
including response-body reads, without automatic retries. Token budgets remain
256 for classification and 2048 for extraction. Timeout errors retain the existing
safe retry/manual-entry flow; provider responses are never logged.

The extraction reservation and browser wait allow four minutes, accommodating two
maximum-length calls plus preparation/persistence. This is an extraction attempt
lifetime, not a change to the worker schedule. Deploy matching web/worker artifacts
so their shared extraction-expiry constant agrees. Existing expiry locking and
atomic result/failure persistence are retained.

Exit evidence/detail, Finance detail, Passport detail, and reminder display reads
use ordinary owner-filtered queries rather than long interactive transactions.
These displays are not a single cross-query snapshot; mutations still recheck
current evidence and versions inside their existing atomic transactions. Temporary
read failures become generic typed 503 errors for existing retry/error boundaries.

## Benefit document extraction (v10)

`benefit_document` now supports employee benefit summaries alongside the six existing extraction categories. Distinctive summary headings select its isolated schema; pension wording alone does not select pension-statement contribution fields. The schema captures employer, employee, role, separate health/group-life/pension clauses, and explicitly named providers. Clause wording includes stated limits and continuation conditions; no portability decisions, coverage-date calculations or automatic Benefit/Passport mutations occur. Every proposal remains grounded and needs review.

The synthetic `benefit_document.pdf` fixture is the supplied employee benefit summary. Provider names are absent and stay empty. The review presents proposed clauses and useful manual fields, with remaining optional fields collapsed. Category-confirmation and manual-entry results use distinct status messages. Validated v9 attempts remain reviewable; this additive schema does not invalidate existing reviews. Older unvalidated classifications retain their existing confirmation requirement.

## Exit confirmation letter extraction (v11)

`exit_letter` now appears in extraction and manual-entry categories as well as document storage. A distinctive Exit letter/Exit confirmation letter heading selects its schema; references to resignation, settlement or pension do not turn it into a notice, settlement or contribution statement. Combined category headings remain ambiguous.

The schema captures only stated employer, employee, role, letter date, last working day, exit type, asset-return wording, settlement references and pension references. Missing dates remain empty; references do not establish payment, clearance beyond the quoted wording, or pension completion. Existing grounding and explicit review requirements apply. No employment, Exit Checker or finance state is automatically changed. Validated v9/v10 attempts remain reviewable; paused older attempts can be retried with Exit letter selected. Synthetic PDF, classification, persistence, authorization and browser coverage protect this additive schema.
