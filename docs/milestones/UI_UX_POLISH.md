# Production UI/UX polish — 7 October 2026

Focused polish of the existing MVP. No new product features, schema changes, dependencies, provider integrations, domain-rule changes, commits, pushes or deployment. The Rumpty inference 503 is outside this pass. Project instructions, applicable core/mobile/security/testing skills, current implementation and all milestone 0–7 reports were reviewed.

## Changes

- **Shell/layout:** finished desktop sidebar with consistent SVG icons, clear active state and brand/footer spacing; fluid content widths; smaller headings; standard card/form spacing and button hierarchy. Original five-area mobile bottom navigation remains, including nested-route selection.
- **Auth:** shared browser/server registration policy: 8–128 characters with uppercase, lowercase, digit and special character. Whitespace is preserved but does not satisfy the special-character check. Password reveal, requirement checklist, password-manager attributes, inline errors/focus, submitting spinner, service/rate-limit feedback, success action and one sign-in link. Existing passwords remain usable at login through a separately shared sign-in schema. Argon2id, CSRF, sessions, revocation and throttling are preserved.
- **Profile:** authenticated email, password-protected status, honest email-verification status, maximum session lifetime and current-browser sign-out scope. Selects only email from the owned account; no new columns or public session data.
- **States:** route skeletons for all primary sections/reminders; upload transfer vs storage completion; interrupted-document recovery/refresh; distinct extraction/manual-entry/review-save messages; bounded UI API waits and retained inputs with check-before-retry guidance for uncertain writes. No automatic mutation retries or inference changes.
- **Forms/first use:** shared 48px controls, 16px input text, select arrows, native dates, focus/error/disabled/read-only styling, reduced-motion support; clearer Home/Exit/Passport/Documents next actions. Exit date validation returns to the correct step and associates notice-date errors with the input.

## Changed files

- `src/app/globals.css`; app shell, Home, Exit, Passport, Documents/detail, Profile, registration and route loading files.
- `src/components/navigation.tsx`, `auth-actions.tsx`, `page-skeleton.tsx`, `ui-request.ts`, employment/exit/upload/document/extraction/finance/Passport/reminder components.
- `src/modules/auth/validation.ts`, `credentials.ts` (shared validation only).
- `tests/password.test.ts`, `registration-diagnostics.test.ts`, `services.integration.test.ts`, `ui-request.test.ts`; all existing E2E viewport/credential fixtures; new `tests/e2e/polish.spec.ts`.
- UI, security and testing documentation plus this report.

## Validation

Only disposable local PostgreSQL 17 and Redis 7 were used, with synthetic local S3/AI fixtures. No automated suite was pointed at production.

```sh
npm run validate
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test npm run db:deploy
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test REDIS_URL=redis://127.0.0.1:56379 npm run test:integration
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test REDIS_URL=redis://127.0.0.1:56379 npm run test:e2e
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test REDIS_URL=redis://127.0.0.1:56379 npm run test:e2e -- tests/e2e/documents.spec.ts tests/e2e/employments.spec.ts --grep '768px|1440px' --output=/tmp/treviqo-polish-layout-recheck
npm run build
git diff --check
```

- Final validate: lint, strict TypeScript, **239 unit tests**, production Next.js build and worker build passed. The production build also passed again after the final CSS refinement.
- Existing nine migrations applied to a fresh disposable database; no new migration.
- **82 integration tests passed**, including legacy-password compatibility, authorization, session revocation, storage, evidence and domain regressions.
- Initial expanded browser run: **72 passed**. **Final run including five auth/Profile visual journeys: 77 passed**, with no failures or skips.
- Responsive coverage: **320, 375, 430, 768, 1024, 1280 and 1440px**. All major flows cover mobile/tablet/desktop; auth/shell and employment additionally cover the intermediate desktop sizes. Browser assertions cover overflow, five-area navigation, keyboard skip links, field validation, errors/retry, private uploads, evidence review, settlement, Passport and reminders.
- Screenshots are in ignored `test-results/`. Visually inspected 320px registration, document detail, exit checklist and Profile; 375px employment history; 768px first-use Home; 1280px shell/history; 1440px document detail and Profile. Long email addresses wrap, status labels remain readable, and mobile navigation stays intact. Desktop detail spacing received a final targeted refinement; all four tablet/desktop document and employment rechecks passed, and the revised 1440px document screenshot was inspected.

An initial TypeScript check found an unchecked first-error key; fixed before final validation. The first sandboxed migration attempt could not connect to local Docker; rerun with approved local access succeeded. Docker was started solely to provision disposable validation services; the two task-owned containers were removed afterward. No test safeguards were weakened.

## Remaining checks and limits

- Live deployment is unchanged. Check the final assets on Rumpty after an explicitly authorized release; this pass does not claim live-browser acceptance.
- Browser automation uses Chromium. Physical iOS/Android devices, Safari file/date pickers, virtual-keyboard behavior and screen-reader testing remain manual.
- Extraction/finance review pages retain their existing long evidence forms. No draft persistence, pagination or new review workflow was introduced.
- Profile reports session policy rather than an exact countdown; NextAuth's public expiry is not the database's absolute expiry. Recovery/MFA/email verification remain existing product limits.
- Rumpty inference 503 remains unresolved by instruction; manual entry remains available.
