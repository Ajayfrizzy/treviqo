# Treviqo AI Document Processing

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
- safe identifier where appropriate
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

The current candidate uses `evidence-v3` / `fields-v3`: a bounded sparse list of present `{key,value,evidence}` facts, expanded server-side to all review fields. Unknown/duplicate keys and missing evidence fail validation. Every sparse proposal starts `needs_review` / Proposed; no value becomes trusted automatically. Legacy complete cell responses retain strict validation. Classification requests 256 output tokens, extraction 2048, with the unchanged 25-second deadline and 64 KiB response cap. Live Rumpty currently does not reliably honor JSON structure/evidence requirements; manual entry remains necessary on failure. See [measured compatibility, failure-path analysis and validation](../deployment/AI_EXTRACTION_DIAGNOSIS.md). Earlier milestone protocol descriptions are historical.

## 8 October 2026 compatibility and persistence update

The current protocol is `evidence-v4` / `fields-v4`; this supersedes earlier
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
`extraction_cleanup` job. See the [current diagnosis and validation report](../deployment/AI_EXTRACTION_DIAGNOSIS.md)
for evidence, limitations and production follow-up.
