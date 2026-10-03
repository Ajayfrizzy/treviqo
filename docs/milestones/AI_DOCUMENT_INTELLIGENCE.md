# Milestone 3 — AI Document Intelligence

Implemented October 3, 2026. Workers can request document classification/extraction, review evidence, confirm/correct/reject fields, mark unknowns, and recover through manual entry. No commits, pushes, deployments, or live inference calls were made.

## What changed

The existing Next.js modular monolith now has an extraction module and an isolated Rumpty inference adapter. The documented AI boundary did not yet have executable code, so this milestone introduces it without changing auth, employment, storage ownership, or deployment topology. The existing private-storage interface gains bounded server-side reads; it does not expose public document URLs.

An additive migration, `20261003040000_document_intelligence`, creates DocumentExtraction, ExtractedField, and ExtractionFieldRevision, with status/confidence/review enums, indexes, and a composite document-owner foreign key. Existing authentication/employment/document data is preserved. The document deletion transaction now purges extraction attempts, evidence, reviewed values, and revisions. Content-free audit events remain.

New audit actions are extraction_started, extraction_completed, extraction_failed, and extraction_reviewed. Reviews and their audit events commit atomically. Source excerpts, model responses, credentials, and values are not included in audit logs.

Only one new dependency, `unpdf`, prepares readable PDF text locally. No provider SDK, OCR service, queue framework, or competing infrastructure was introduced. Next standalone tracing includes the parser package and subprocess script; Docker smoke verifies they work in the non-root runtime.

## AI, prompts, schemas, and supported types

The injectable `DocumentAI` contract accepts a fixed system prompt, source text, and JSON schema. The Rumpty adapter uses explicit environment configuration and an OpenAI-compatible chat-completions HTTP protocol. It sends no tools or storage URLs, disallows redirects, and has no fallback provider. Real Rumpty protocol compatibility has not been verified: its endpoint documentation/configuration was not supplied.

Classification and type-specific extraction are separate narrow calls. Classification supports the four priority types plus Other; low/needs-review classification stops before selecting a field schema. The worker can supply a supported type for a subsequent attempt. High confidence never confirms a field automatically.

| Type | Named fields |
| --- | --- |
| Employment contract | Employer, employee, role, start date, employment type, salary/currency, salary frequency, notice period, annual leave, probation, pension/HMO/group-life references, exit clause |
| Payslip | Employer, employee, pay period, gross/net pay, basic salary, pension deduction, tax, other deductions, explicit reimbursements and allowances |
| Resignation letter | Letter date, notice date, proposed last day, stated notice period, explicit reason |
| Termination letter | Letter date, effective date, stated reason, notice/pay-in-lieu wording, settlement references, benefit termination wording |

Amounts/dates/clauses are nullable verbatim strings, not calculated or normalized values. References to benefits, pension, or settlement are merely quotations; no later workflow or judgment is performed. Unsupported document types do not receive a forced schema.

Each proposal contains value, source excerpt, and high/medium/low/needs_review confidence. Strict Zod schemas reject unknown/missing keys and invalid values. Evidence must appear in source text after whitespace normalization, and the proposed value must appear in that excerpt. Unsupported field proposals are discarded to null/Needs review. Wrong semantic interpretation can still pass a substring check and therefore requires human review.

Prompts treat source text as untrusted evidence and disallow instructions inside it, inference, calculations, entitlement, legal judgments, and readiness decisions. Prompt `evidence-v1`, schema `fields-v1`, configured model ID, source kind/hash, and timestamps are persisted per attempt. Full source text and raw provider output are transient; only selected excerpts and proposals are stored. Model confidence is an uncalibrated hint, not a probability or trust signal.

## Preparation, failures, and retries

Automatic preparation supports text-based PDFs up to 30 pages and 18,000 characters. It reads private bytes with a 20 MiB ceiling, checks the saved SHA-256, and parses in a subprocess with a 10-second timeout and 128 MiB V8 heap limit. The parser receives no application secrets and emits no diagnostic contents. Oversized text is rejected, not silently truncated. This is resource containment, not an OS sandbox or antivirus.

Scanned/image/blank/encrypted/unreadable documents use optional user transcription or manual field entry. Transcriptions are explicitly labelled and not represented as verified file text. No OCR/vision capability is assumed. Manual entry works with all three AI environment variables blank and never calls AI/storage.

Inference uses temperature 0, JSON-object mode, 4096 output tokens, a 25-second deadline per call, and a 64 KiB response ceiling. Failed HTTP calls, malformed/truncated output, invalid schema, unreadable text, and interrupted attempts produce generic recovery states without persisting raw errors. There are no automatic paid retries.

A database document lock reserves each attempt; only one active attempt per document is allowed. Inference runs outside the transaction. A two-minute lease allows explicit retries after interruption; expired attempts cannot finalize. Earlier reviews are preserved as separate attempts. Redis permits 10 starts per worker per 10 minutes, including manual attempts, and fails closed. The UI can refresh an in-progress attempt and view earlier attempts.

Finalization/review locks serialize against document deletion. Once deletion starts, new extraction access is denied; deletion removes derived data and late responses cannot recreate it. Existing authorized provider calls may still finish. A failed database acknowledgement can leave a Processing attempt until lease recovery or a committed result discoverable by refresh.

## Mobile review and trust

A Ready document links to `/documents/:id/review`. Cards display original proposal, source excerpt, confidence, review state, and any reviewed value. Actions are Confirm proposal, Save correction, Reject, and Mark unknown. Null values cannot be confirmed. Failed saves preserve typed corrections; concurrent edits produce a refresh/conflict error instead of overwriting another tab.

Original proposals remain immutable. Confirmed/Corrected values are stored separately and each change gets a revision; Rejected/Unknown have no trusted value. Confirming again explicitly confirms the original proposal. The interface shows the latest 20 attempts and latest 20 revisions per field; older records remain stored until document deletion. A corrected classification does not rewrite the uploaded category or existing field schema; choose the proper type and start a new attempt for different fields.

No bulk/automatic confirmation is provided. Reviewed values do not update Employment and do not feed readiness, legal interpretation, Job Exit Checker, settlement comparison, pension verification, benefits, or Benefit Passport.

## Files created/changed

- `prisma/schema.prisma`; `prisma/migrations/20261003040000_document_intelligence/migration.sql`.
- New `src/modules/extractions/{shared,schema,prompts,service,http,rate-limit}.ts`.
- New `src/server/ai/{client,content}.ts`, `pdf-worker.mjs`; extended `src/server/storage/client.ts`, `src/server/config/env.ts`.
- New `src/app/api/documents/[id]/extractions/route.ts`, `src/app/(app)/documents/[id]/review/page.tsx`, and `src/components/extraction-review.tsx`.
- Updated document detail page, global styles, document deletion service, `.env.example`, `next.config.ts`, package manifest/lockfile, and Playwright configuration.
- New `tests/extraction.test.ts`, `ai-client.test.ts`, `extractions.integration.test.ts`, `e2e/extractions.spec.ts`, `fixtures/ai-server.mjs`, and four synthetic JSON/PDF fixture pairs under `fixtures/intelligence/`.
- Updated fake storage and production smoke test. README, AI/architecture/security/UI/testing/deployment docs, milestone index, and this report updated.

## Validation

| Command | Result |
| --- | --- |
| `npm run db:generate` | Passed |
| `npm run lint` | Passed after fixes, including final test changes |
| `npm run typecheck` | Passed after fixes, including final test changes |
| `npm test` | 65 passed, no skips |
| `npm run db:deploy` | All five migrations applied to disposable PostgreSQL 17 |
| `npm run test:integration` | 34 passed, no skips |
| `npm run test:e2e` | Full 31-scenario run: 30 passed; one ambiguous test locator failed |
| `npm run test:e2e -- tests/e2e/extractions.spec.ts` | All five extraction scenarios passed after locator correction; all 31 unique browser scenarios now have passing results |
| `npm run build` | Passed |
| `npx prisma migrate diff --from-url postgresql://treviqo_test@127.0.0.1:55432/treviqo_test --to-schema-datamodel prisma/schema.prisma --exit-code` | No difference detected |
| `docker build -t treviqo:m3 .` | Passed; standalone parser assets included |
| `docker build --target migrate -t treviqo-m3-migrate .` | Passed |
| `docker run --rm -e DATABASE_URL=postgresql://treviqo_test@host.docker.internal:55432/treviqo_test treviqo-m3-migrate` | Five migrations; none pending |
| `docker exec treviqo-m3-smoke node tests/production-smoke.mjs` | Passed production PDF preparation, TLS inference, grounded proposal, confirmation, derived-data deletion, vault lifecycle, non-root auth and secure-cookie/logout checks |
| `npm audit --omit=dev` | Zero production vulnerabilities |
| `git diff --check` | Passed |

Service/browser commands used exported `DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test` and `REDIS_URL=redis://127.0.0.1:56379`. All data/credentials were synthetic. Docker smoke used local TLS S3/inference fixtures and a temporary CA via NODE_EXTRA_CA_CERTS; TLS verification remained enabled. Disposable containers/fixture processes were stopped after validation.

New tests cover all four real PDF fixtures, strict response validation/grounding, proposal-vs-reviewed separation, privacy/ownership, all four review actions, history/conflicts, manual entry, inference outage/malformed output, low-confidence classification, retry preservation, processing lease recovery, throttling rejection, audit rollback, and deletion during inference. Screenshots at 320/375/430px were visually inspected; browser assertions confirmed no horizontal overflow and retained mobile navigation. Existing foundation/employment/vault tests passed.

Failures fixed during implementation: the parser library exposes cleanup through `loadingTask.destroy`, not `destroy`; lint required moving JSX outside a try/catch; a test helper shadowed browser `document`; and an E2E alert locator also matched Next.js's route announcer. No validation failures remain. Installation still reports five existing high development-tool advisories; production audit is clean. No forced unrelated dependency upgrades were made.

## Remaining Rumpty configuration and limitations

Configure `RUMPTY_AI_BASE_URL`, `RUMPTY_AI_API_KEY`, and `RUMPTY_AI_MODEL` together. Verify the actual Rumpty API accepts the documented protocol/JSON mode and model context/output limits. These values are placeholders only in `.env.example`. Existing S3/GetObject, PostgreSQL, Redis, canonical URLs, and session secret remain required. Apply the migration before rollout; allow parser child processes and at least 90 seconds at ingress. Set host/container memory, request concurrency, and per-client abuse controls.

Live model accuracy, prompt resistance, latency/capacity, provider TLS/privacy/retention, physical-device pickers, and real Rumpty behavior were not tested. Fixtures verify application behavior, not intelligence quality. Confidence cannot guarantee correctness; evidence checks cannot establish semantic truth. Scans/images need manual help; there is no OCR, multilingual quality guarantee, amount/date normalization, page-coordinate citation, background queue, automatic retry, or automatic trusted-data merge. Review history is sensitive and shares document ownership; backups/provider retention require separate policy.

Deliberate scope choices: implemented the four milestone priority types only; used a synchronous bounded pipeline within the monolith; kept verbatim values instead of premature domain normalization; added manual fallback without assuming vision/OCR support; isolated the unverified live protocol behind one adapter. Milestone 4+ functionality remains unimplemented.
