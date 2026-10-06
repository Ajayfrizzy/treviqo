# Milestone 6 — Benefit Passport v1

Implemented locally on 4 October 2026, extending the existing uncommitted Milestone 5 work. No commit, push, deployment, live inference, or real-worker records were used.

## Approach and changes

Passport is a live, owner-scoped projection of **closed** Employment records. Its stable entry ID is the employment ID; no duplicated PassportEntry snapshot/table or generation job is needed. The timeline shows employer, role, original start/end dates and recorded exit type. An unknown end date remains unknown. Detail shows original employment context, current exit checklist follow-up status, key document availability, reviewed pension provider and current final-contribution verification, and six benefit categories.

`src/modules/passport/{shared,rules,service,http}.ts` owns the projection, strict commands, masking, and deterministic benefit assessment validation. `/api/passport` and `/api/passport/[id]` serve list/detail and assessment mutations. `/passport` and `/passport/[id]` provide the mobile timeline/detail. Closed employment details link to their Passport entry; nested Passport pages keep Passport selected in the existing five-section navigation.

Existing Exit Checker and finance services expose their authorized projections for reuse inside the Passport's repeatable-read transaction. Their rules are not copied or replaced. In particular, Passport reads the current pension verification decision instead of trusting a stored confirmation timestamp. This ensures changed/deleted statement evidence cannot appear as currently confirmed in Passport.

The additive migration `20261004000000_benefit_passport` creates BenefitCategory/BenefitPortability enums and Benefit, and adds content-free benefit audit actions/reference. Existing user/auth/employment/documents/extraction/exit/finance data is preserved. No new dependency, environment variable, provider, or background process is added.

## Benefit classification and history

One current assessment per employment/category covers pension/RSA, HMO, employer group life, employer-specific, cooperative, and provident/retirement plans. Every category starts **Unknown / needs confirmation**. A category, pension participation answer, provider name or reviewed contract mention never automatically establishes coverage or portability.

Workers can assess **Portable**, **Employer-linked**, or **Unknown**. Non-unknown choices require a current private document from that employment and explicit acknowledgment that it supports the assessment. An optional current confirmed/corrected benefit field binds the assessment to that field's review version. Document selection permits original evidence for categories without extraction schemas. Passport introduces no new AI schema or legal interpretation of contract text.

Portable means the worker assessed continuation independently of this employer; employer-linked means the worker assessed dependence on the employment. Neither asserts active coverage, completed transfer or verified entitlement. The UI labels these as **worker assessments**, separately from **confirmed/corrected document fields**. Corrected/manual fields are reviewed evidence, not independent provider verification.

Benefit stores category, assessment, source IDs/version/metadata timestamp, employment/exit context hash, optimistic version and timestamps. It stores no copied benefit text, provider identifier, monetary value, or arbitrary free-text note. Across closed entries, category assessments and reviewed references form a concise employment-specific benefit history. There is one assessment per category, not a multi-policy register or immutable edit-history product. Removal returns the category to unresolved while retaining action audits; source records are not deleted.

## Derivation, freshness and provenance

- Employment names, dates, closed status and exit type are labelled worker-entered. Closing employment does not imply completed exit actions.
- Exit status uses the existing nine-rule checklist to show outstanding items and links back to source answers. No overall legal/readiness score is created.
- Key document groups show current private record availability for contracts, pay/settlement, exit, pension and benefit documents. Availability does not imply validated contents. Failed/processing/deleting records are unavailable; deleted sources disappear.
- Provider comes only from current confirmed/corrected pension-statement provider fields. If finance selected a statement attempt, only that attempt is used; an unavailable selected source is never silently replaced. Without a selected attempt, conflicting reviewed provider names yield Needs clarification. Proposed/high-confidence-but-unreviewed values are excluded.
- Pension participation remains the recorded Yes/No/Unknown answer. Final-contribution states reuse Milestone 5: not started, waiting, detected, not detected, needs clarification, confirmed by the worker. Provider/participation/portability are distinct from contribution confirmation.
- Assessment hashes bind employment details/update time and exit context; selected document metadata and field review versions must remain current. Changed, rejected, deleted, unavailable or reclassified evidence and changed employment/exit context downgrade the assessment to Unknown with the previous choice clearly marked no longer current.
- Reopening employment removes the entry from list/detail; re-closing makes it available again with earlier assessments requiring review. Corrections are made in original employment/document/exit/finance flows, not copied into Passport.
- Freshness is checked on page load, API read, save and Refresh Passport. No push subscription, scheduler or background reconciliation is introduced. A failed refresh identifies displayed data as from the last successful load; a 404 clears the entry instead of retaining stale confirmation cards.

## Security and privacy

All list/detail/mutation paths independently require the authenticated owner. Employment must currently be closed. Sources must belong to the same owner and employment. A composite employment/owner foreign key and unique employment/category enforce database ownership/uniqueness. Strict commands reject owner/source injection; writes require same Origin, JSON, and a bounded 4 KiB body.

Mutations lock the owned employment row under Serializable isolation, check optimistic version/context, and atomically audit benefit save/removal. Audit failure rolls back the mutation. Retryable transaction conflicts produce safe recovery copy. Read results use an explicit minimal DTO and private/no-store responses.

Passport never serializes document filenames, original excerpts, proposals, financial amounts, account/RSA/policy identifier fields, object keys, checksums, or credentials. Document links use generic type/date labels and existing authorized routes. Additional server masking hides identifier-like sequences, labelled IDs and emails accidentally entered in employer/role/provider display names; no reveal control exists. This is defensive pattern masking, not a universal sensitive-text detector. Original documents remain private evidence and may contain identifiers when deliberately opened through the existing vault.

## Mobile UX

A semantic timeline of closed-employment cards leads to detail cards for employment, exit, pension, benefits and key documents. Touch targets, fieldsets/labels, native selection controls, visible source links, save/cancel/remove, explicit assessment acknowledgment, and refresh support phones. Empty/loading/error/success states use the existing app boundaries plus client request feedback; failed saves retain input. Unknown and stale states use text rather than color alone. No dense table, download, export, sharing, certificate or employer-verification flow exists.

Browser checks cover 320/375/430px, bottom-navigation selection, overflow, save/cancel/retry, source deletion, and reopening employment. The 320px screenshot was visually inspected and action spacing adjusted. Physical touch-device validation remains a manual deployment check.

## Validation record

All database/browser/smoke validation uses disposable PostgreSQL 17/Redis and synthetic local protocol fixtures. No live Rumpty inference is required.

| Command/check | Result |
| --- | --- |
| `npm run validate` (lint, typecheck, unit tests, production build) | Passed; 201 unit tests |
| `npm run test:integration` | 70 passed |
| `npm run test:e2e` | 45 passed |
| `npm run db:deploy` | Eight additive migrations applied to fresh database |
| `npx prisma migrate diff --from-url <disposable-url> --to-schema-datamodel prisma/schema.prisma --exit-code` | No difference; exit 0 |
| `docker build --target runtime -t treviqo-m6:local .` | Passed |
| `docker build --target migrate -t treviqo-m6-migrate:local .` | Passed |
| `docker run --rm -e DATABASE_URL=<disposable-url> treviqo-m6-migrate:local` | Passed; no pending migrations |
| `docker exec treviqo-m6-runtime node /app/tests/production-smoke.mjs` | Passed as UID 1001 with local TLS S3/inference fixtures |
| `git diff --check` | Passed |

New suites: `tests/passport-rules.test.ts`, `tests/passport.integration.test.ts`, and `tests/e2e/passport.spec.ts`. They cover all category defaults, current portable/employer-linked assessments, missing/stale/proposed/rejected evidence, conflicting providers, masking, date unknowns/mismatches, source selection/ownership, reopen/re-close, optimistic conflicts, audit rollback, concurrent creates, and current finance-derived pension confirmation. The production smoke adds closed-entry derivation, pension status reuse, benefit assessment/audit and source-deletion invalidation.

Failures addressed during implementation: moved JSX construction outside a try/catch to satisfy the installed React lint rule; fixed a pre-existing finance test helper relying on unspecified PostgreSQL field ordering. Running integration/browser writes concurrently against one small shared database also exposed a PostgreSQL Serializable predicate-lock conflict; final suites run separately and integration files run sequentially. Explicit in-file concurrency tests remain enabled. No authorization or evidence rule was weakened. Final runs have no failed or skipped tests. Only task-owned disposable containers and fixture servers were removed after validation.

## Known limits and scope

Passport is a current personal summary, not an immutable historical snapshot. One category assessment cannot represent multiple policies/providers within that category. No automatic portability inference, provider verification, benefit-policy extraction, financial totals, legal conclusions, document export or sharing is added. Unknown information remains unresolved with source links. Original evidence and worker judgment still determine semantic accuracy; pattern masking cannot recognize every possible identifier embedded in free-form names.

The existing Rumpty configuration suffices. Deployment still requires real provider credentials/endpoints, private storage/TLS/retention verification, model protocol/accuracy checks for existing extraction, backup/restore and physical-device checks. No live deployment is claimed.

**Milestone 7+ reminder automation, advanced analytics, family claim readiness, external provider integrations and post-hackathon features were not implemented.**
