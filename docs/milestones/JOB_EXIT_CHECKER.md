# Milestone 4 — Job Exit Checker

Implemented October 3, 2026. Workers can create and update an employment-specific exit case and use a deterministic, evidence-backed checklist. All five exit types are supported: resignation, termination, redundancy, contract completion, and retirement. No commit, push, or deployment was performed. Existing uncommitted Milestone 3 work was preserved.

## Architecture and data

The existing Next.js modular monolith is extended by `src/modules/exits`: shared input schemas, a pure rules engine, owner-scoped persistence/evidence loading, and HTTP transport. There are no new dependencies, environment variables, providers, background processes, or AI calls.

The additive `20261003050000_exit_checker` migration creates ExitCase, enum-backed types/answers, timestamps, optimistic version, a user/update index, and User/composite Employment-owner foreign keys. Employment is unique per case: one editable case per employment. The migration also adds exit_created/exit_updated audit actions and optional AuditEvent.exitCaseId; documentId becomes nullable for these non-document events. Existing rows are preserved. Auth and employment state/end dates are not changed by exit-case operations.

ExitCase uses typed columns rather than a generic JSON answer bag. Required inputs are the owned employment, exit type, and planned/actual last working date. Notice/decision communication date is optional. Unknown answers are explicit enum values; no inferred defaults imply pension participation, payable leave, notice applicability, or benefit continuity. The last working date cannot precede the employment start date at save time. Future dates are allowed.

Evidence IDs are references, not authorizing credentials or copied source contents. New selections must be Ready documents or Confirmed/Corrected contract notice fields belonging to the same user and employment. The chosen notice field's review version is retained. Source IDs deliberately have no source-delete cascade/foreign key: deletion should make a checklist item Missing/Needs clarification, not delete a case or silently clear its provenance. Every use revalidates ownership, availability, and review status/version. Stale references may be retained during unrelated answer edits; new references must pass validation.

`buildChecklist` returns nine items under rules version `exit-checker-v1`. Each has a stable rule ID, state, title, explanation, next action, and document/field/worker-answer references. A repeatable-read transaction loads consistent current answers and evidence. Checklist items are derived on read rather than stored, preventing stale persisted Complete states. No client-supplied checklist or state is accepted. There is no overall readiness score or legal verdict.

Transport: `GET/POST /api/exits`, `GET/PUT /api/exits/:id`, and `GET /api/exits/evidence?employmentId=...`. Every handler and page independently checks authentication/ownership. Mutations require exact Origin, JSON, an actual streamed 8 KiB limit, and strict schemas. Updates cannot reassign employment or owner and require a matching optimistic version. Concurrent duplicate creation is prevented by the unique constraint. Save and audit commit atomically. Errors are generic for infrastructure failures; foreign/missing cases both return 404. DTOs omit user IDs/credentials and use private/no-store responses.

## Rules and states

All five states are represented: Complete, Pending, Missing, Needs clarification, Not applicable. A Complete result only means the described record/answer check is satisfied; messages identify when that conclusion comes from the worker's report rather than a document selection. Every item includes a next action, including guidance to retain supporting records for Complete/Not applicable states.

| Rule | Coverage |
| --- | --- |
| Notice and dates | Explicit applicability, missing dates/wording, simple calendar comparison, ambiguous clauses, inconsistent dates, changed/unconfirmed/deleted reviewed field |
| Final salary records | Current selected payslip/settlement category and worker-identified pay period; no payment, amount, or period-coverage verification |
| Unused leave | Unknown, none, outstanding follow-up, worker-reported clarification; no payout entitlement assumed |
| Reimbursements | Unknown, none, outstanding without/with selected claim evidence, reported clarification; no settlement comparison |
| Pension records | Unknown/nonparticipation, missing provider/contact preparation, reported saved details; no contribution check |
| Company assets | Unknown, no assets, held, scheduled, returned without/with current acknowledgement |
| Exit documents | Current selected evidence, missing/deleted evidence, next actions tailored to all five exit types |
| Reference/employment evidence | Unknown/not needed/not requested/requested/saved without or with current evidence |
| Employer-linked benefits | Unknown/none/unresolved/clarified end dates and contacts; no portability or continued-coverage decision |

See [DOMAIN_RULES.md](../domain/DOMAIN_RULES.md) for the full state matrix. Evidence from AI is limited to an explicitly selected previously confirmed/corrected contract notice value. High-confidence proposals, rejected/unknown fields, unavailable documents, foreign evidence, and a different employment's evidence are ineligible. A changed review version produces Needs clarification rather than silently accepting a new value. AI never selects a checklist state.

Notice counting supports exact numeric days (optionally “calendar”), weeks, or months. Days exclude the communication day; weeks mean seven calendar days; calendar-month addition clamps to the target month end. These are explicit comparison conventions, not jurisdiction-specific legal counting rules. Supported durations are up to 730 days or 24 months, including zero days. Working days, spelled-out numbers, alternatives, pay-in-lieu, and conditional clauses require clarification. Tests cover exact boundary/short/long periods, leap days, month ends, year rollover, reversed dates, and range limits.

## Mobile flow

The Exit tab now provides employment selection, four steps (Exit details; Notice; Money and pension; Records and benefits), and a card-based checklist. Save and view checklist is available from every step after the required details are valid, so a worker can save early and return. Back/Next, Cancel, clear validation, saving feedback, and retry preserving entered values are implemented. Loading, unavailable, empty, and not-found states are included.

Source selection uses only the chosen employment's available records. Missing selections stay visibly unavailable instead of silently switching files. Checklist source links reuse secure Documents/review routes. Nested routes keep Exit active in the five-section bottom navigation. Home now links to real saved cases. Long text wraps within cards; no desktop tables were added. The app does not close employment or declare the entire exit complete.

## Files created/changed for Milestone 4

- `prisma/schema.prisma`; new `prisma/migrations/20261003050000_exit_checker/migration.sql`.
- New `src/modules/exits/{shared,rules,service,http}.ts`.
- Exported the existing reusable calendar-date validator from `src/modules/employments/validation.ts`.
- New `src/app/api/exits/route.ts`, `[id]/route.ts`, `evidence/route.ts`.
- Functional `src/app/(app)/exit/page.tsx`; new new/detail/edit/loading/error/not-found exit pages.
- New `src/components/exit-form.tsx`; updated Home, navigation, and global styles.
- New `tests/exit-rules.test.ts`, `exits.integration.test.ts`, `e2e/exits.spec.ts`; extended production smoke.
- README and architecture/domain/security/UI/testing/deployment/milestone documentation, including this report.

Package/environment changes already present from Milestone 3 remain untouched by this milestone. No new package or configuration input was needed.

## Validation results

| Exact command | Result |
| --- | --- |
| `npm run db:generate` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 135 passed, including 70 Exit Checker rule/input tests; no skips |
| `npm run db:deploy` | All six migrations applied to disposable PostgreSQL 17 |
| `npm run test:integration` | 43 passed, including nine new exit service tests; no skips |
| `npm run test:e2e` | Full suite: 37 passed, including six new Exit Checker scenarios; no skips |
| `npm run build` | Passed |
| `npx prisma migrate diff --from-url postgresql://treviqo_test@127.0.0.1:55432/treviqo_test --to-schema-datamodel prisma/schema.prisma --exit-code` | No difference detected |
| `docker build -t treviqo:m4 .` | Production standalone image built |
| `docker build --target migrate -t treviqo-m4-migrate .` | Release image built |
| `docker run --rm -e DATABASE_URL=postgresql://treviqo_test@host.docker.internal:55432/treviqo_test treviqo-m4-migrate` | Six migrations found; none pending |
| `docker exec treviqo-m4-smoke node tests/production-smoke.mjs` | Passed non-root auth/secure cookies/session revocation plus exit create, nine rules, update, stale-edit rejection and audits |
| `git diff --check` | Passed |

Integration/browser commands used exported `DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test` and `REDIS_URL=redis://127.0.0.1:56379`, pointing only to disposable local containers with synthetic data. Browser tests included previous vault/AI fixtures without live Rumpty inference. Docker smoke deliberately ran without S3/AI configuration to prove Exit Checker independence; the unchanged optional storage/AI smoke branches were not rerun for this milestone. Validation containers were removed afterward.

Authorization tests cover owner/foreign/unauthenticated access, same-owner different-employment evidence, attempted owner/employment injection, database ownership constraints, concurrent duplicate creation, optimistic conflicts, Origin rejection, audit rollback, and immutable employment state. Evidence tests show proposed AI fields are excluded, reviewed fields can be selected, and review changes/rejection/deletion stop satisfying notice rules. Document deletion invalidates previously complete document checks on the next read.

The browser suite exercises all five exit types and states, mobile step/checklist layouts at 320/375/430px, editing/reload persistence, save-and-return/cancel, no-employment state, required dates, simulated save failure/retry, Home links, navigation and direct API/page access. Screenshots at all three mobile widths were visually inspected. No horizontal overflow was found. A final presentation cleanup removed the internal rules-version label from the UI (the API/report retain it) and added long-text wrapping; lint/typecheck/build were rerun afterward.

No validation failures occurred in Milestone 4. Expected expired-session test logs and existing color-environment warnings appeared. Docker installation reported the five previously documented high development-tool advisories; no dependencies were added or force-upgraded here.

## Limits and manual checks

- One editable case per employment; no archive, deletion, case closure, or multiple historical exits yet. No automatic employment status/end-date change.
- A planned/actual last working date is required to create the case. Unknown dates cannot yet be saved as an undated draft. Unsaved form input is preserved during retry but not across navigation/reload; use Save before leaving.
- Most non-notice checks track evidence availability or clearly labelled worker reports. File selection does not verify its contents. There is no money calculation, legal entitlement, final-pay coverage assessment, contribution verification, benefit classification, or overall readiness verdict.
- Only simple calendar notice wording is machine-compared. Actual notice arrangements may need employer/professional clarification. Conflicting sources are not automatically resolved; the worker explicitly selects one reviewed field or enters wording.
- Checklist state is recomputed on read, not pushed live into already-open tabs. There is no historical checklist snapshot or rule-result audit history. Evidence selectors and case lists are not paginated.
- No new Rumpty credentials are required. Apply the additive migration before rollout and retain existing PostgreSQL/Redis/auth/ingress configuration. Live Rumpty networking/deployment and physical-device testing remain manual; no deployment was performed.

Milestone 5+ settlement comparison, pension verification, Benefit Passport, benefit portability, and reminder workflows were not implemented. References to final pay, pension, or benefits in this checker are limited to the documented record/preparation questions.
