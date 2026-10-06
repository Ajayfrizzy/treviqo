# Milestone 5 — Final Settlement & Pension Verification

Implemented locally on 3 October 2026. No commit, push, deployment, real-worker data, or live Rumpty inference was used.

## What changed

The existing modular monolith now has `src/modules/finance/{shared,rules,service,lifecycle,http}.ts`, an owned `/api/exits/[id]/finance` GET/POST endpoint, and `/exit/[id]/finance` mobile review page. Exit details link to it. `src/components/finance-review.tsx` supplies comparison cards, source links, add/edit/remove actions, pension review/confirmation, saved follow-up dates, refresh, and loading/error/success states. The five primary destinations remain unchanged.

`prisma/schema.prisma` and additive migration `20261003060000_settlement_pension` introduce SettlementItem, PensionVerification, settlement categories, audit actions, and composite ownership foreign keys to ExitCase. Existing authentication, employment, documents, extraction history, and exit data are preserved. No extracted monetary values are copied into finance records. Deleted source references remain inert IDs so reads can explain missing evidence.

Employment/exit saves initialize one waiting pension verification when employment is closed and pension participation is explicitly Yes. Workers may also start it from an open exit. This does not close employment, change exit answers, or generate reminders automatically. Follow-up defaults to employment end/last working date plus 30 calendar days as a changeable planning convention, not a regulatory deadline.

No dependencies, environment variables, infrastructure providers, worker processes, or public document URLs were added.

## Settlement comparisons (`finance-v1`)

Each item selects a current final-settlement document, category, label, a confirmed/corrected expected field from another document belonging to the same employment, and optionally a reviewed amount in the settlement. Both source review versions are bound to the item. Workers explicitly identify both contribution/pay months and confirm that the fields describe the same item; they must not compare gross with net, recurring with partial pay, or unapproved claims with approved amounts.

Categories: final salary, leave, reimbursement, bonus/commission, pension deduction, loan deduction, other deductions, total. The server limits eligible field keys by category. Evidence can come from supported contract, payslip, or earlier settlement extraction; separate expense/benefit extraction schemas are not added. Up to 50 items per case.

- **Amounts consistent:** explicit amounts/currencies and worker-identified periods match.
- **Not identified:** worker selected that they did not identify the item in the full settlement record. This is not inferred solely from a null AI result.
- **Needs clarification:** evidence changed/rejected/deleted, duplicate expected/actual selections, different periods, different/ambiguous currencies, unsupported precision/wording, or differing amounts.

Money uses exact integer minor units (`bigint`), at most 12 whole digits and two decimal places. NGN/₦, USD, GBP and EUR are supported. Currency must be explicit. No aggregation, proration, gross/net conversion, exchange rates, statutory calculation, entitlement, or payment verification is performed. Every result has safe explanatory wording and a next action. Missing/unclear evidence never becomes a legal conclusion.

## Pension verification

Select a target contribution month, a statement extraction attempt, optional reviewed payslip employee deduction, and optional follow-up date. Statement upload and review use the existing private document pipeline.

The deterministic matcher requires reviewed coverage months containing the target month, a worker-confirmed completeness answer, and separately reviewed employer, contribution month, posting date, employee amount and employer amount for each represented entry. Employer match normalizes case/whitespace only. A late posting date can match the contribution month. Optional payslip deduction requires its reviewed pay period to equal the target month and compares only against the employee component.

States are Waiting, Contribution detected, Contribution not detected, Needs clarification, and Confirmed by you. Unknown participation, missing/incomplete/rejected rows, ambiguous dates/amounts, multiple matching rows, zero combined contributions, or mismatching deductions require clarification. Rows are never automatically summed. Absence means no matching entry was identified in the reviewed statement, not nonpayment.

A detected match needs an explicit worker confirmation. The server checks the optimistic version and a SHA-256 token covering current rules, reviewed evidence, and employment/exit context. Changed/rejected/deleted evidence or changed employment/exit context invalidates the earlier confirmation on read. Source selections can be saved again for a new review. Confirmation timestamps are historical metadata, not independent pension-provider verification. Follow-up dates are persisted only; no scheduler, notifications, PFA integration, or broader reminder workflow exists.

## AI design

`src/modules/extractions/{shared,schema,prompts}.ts` extends the existing abstraction with final-settlement and pension-statement schemas. New attempts record `evidence-v2` / `fields-v2`; earlier attempts retain their original versions and reviews. Existing four extraction types continue to work.

Settlement fields: pay period, final salary, leave, reimbursement, bonus, pension deduction, loan deduction, other deduction, total.

Pension fields: provider, coverage start/end, completeness, and three separate contribution slots (employer, contribution period, posting date, employee amount, employer amount). No account/RSA identifiers are requested. Prompts preserve verbatim evidence, prohibit calculations and legal decisions, and never merge rows. The parser forcibly leaves AI completeness null; only a worker can correct it to Yes after reviewing all entries. More than three entries require a narrower statement or clarification. Canonical month/date/currency formats needed by deterministic rules may require manual correction; original proposals/excerpts and revision history remain available.

AI is optional. Manual entry, correction, rejection, source grounding, confidence states, inference failure/retry, and ownership use the existing document pipeline. Low-confidence proposals are never trusted automatically.

## Security and consistency

All reads/writes require the authenticated owner, an owned exit/employment, and sources from that employment. Composite PostgreSQL foreign keys enforce finance ownership. POST requires same-origin JSON and an 8 KiB body bound; strict input schemas prohibit ownership changes. API responses are private/no-store, and errors do not reveal database/provider details.

Reads use a repeatable snapshot. Commands use serializable transactions, an owned exit-row lock, optimistic item/verification versions, and transactional audit events. Conflicts return a retryable safe error. Audit records contain action/owner/case references, not financial values or document content. Audit failure rolls back the mutation. Existing vault authorization and deletion behavior is reused.

## Validation

Commands run with disposable PostgreSQL 17/Redis and synthetic storage/inference fixtures:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 176 passed |
| `npm run test:integration` | 57 passed |
| `npm run test:e2e` | 41 passed |
| `npm run build` | Passed; finance API/page included |
| `npm run db:deploy` | All seven migrations applied to fresh database |
| `npx prisma migrate diff --from-url <disposable-url> --to-schema-datamodel prisma/schema.prisma --exit-code` | No difference, exit 0 |
| `docker build --target runtime -t treviqo-m5:local .` | Passed |
| `docker build --target migrate -t treviqo-m5-migrate:local .` | Passed |
| `docker run --rm -e DATABASE_URL=<disposable-url> treviqo-m5-migrate:local` | Passed; repeat deploy has no pending migrations |
| `docker exec treviqo-m5-runtime node /app/tests/production-smoke.mjs` | Passed with local TLS storage/inference fixtures |

New tests: `tests/finance-rules.test.ts`, `tests/finance.integration.test.ts`, `tests/e2e/finance.spec.ts`, and JSON/real PDF fixtures for both new extraction types. Existing extraction tests/protocol fixture and production smoke were extended. Coverage includes exact amounts, ambiguity/missing data, period/currency mismatch, employee-vs-employer contributions, late postings, duplicate rows/selections, owner isolation, strict inputs, audit rollback, optimistic conflicts, lifecycle idempotence, changed/rejected/deleted evidence, explicit confirmation, real upload/PDF/inference/review, mobile error/retry and overflow at 320/375/430px. The 320px screenshot was visually inspected; physical-device testing remains manual.

Initial failures were test corrections: an import used a nonexistent employment service factory, a no-match unit test retained a different expected payslip month, and new browser tests expected 201 instead of the existing extraction endpoint's 200. These were fixed; the focused finance browser rerun passed all four tests. No application safeguards were weakened to pass tests.

The Docker smoke runs as UID 1001 and exercises authentication/cookie revocation, private TLS S3 upload/download/deletion, traced PDF subprocess, TLS inference transport, both new extraction types, settlement comparison, pension confirmation, and invalidation after deletion. Local protocol fixtures do not prove real bucket policy or model accuracy.

## Configuration and limitations

Apply the new migration before runtime rollout. Existing Rumpty PostgreSQL/Redis/private S3/AI variables suffice. Live Rumpty endpoints/credentials, TLS/private-bucket policy, model protocol/accuracy/capacity and retention settings, ingress protection, backup/restore, and physical-device review remain deployment checks. No live credentials were invented or added.

This is a narrow evidence comparison tool: one editable pension verification/target period per exit, at most three statement rows, no automatic salary-period inference, aggregate reconciliation, provider confirmation, legal interpretation, or bank/payment checks. Workers must check source meaning and completeness. Large/ambiguous statements remain Needs clarification/manual fallback. Changes are detected on read/refresh, not by background push. Follow-up dates are stored planning data, not delivered reminders.

Milestone 6+ Benefit Passport, benefit classification, broader reminders/automation, and external provider integrations were not implemented. Deferring automation is intentional per the requested scope.
