# Milestone 1 — Employment Records & Mobile Shell

Implemented October 3, 2026. Workers can create, view, edit, and organize their own employment records. No later product workflows were introduced. Live Rumpty deployment remains pending configuration; nothing was committed or pushed.

## Behavior

Home now offers first-use onboarding through an empty-state card and an action to add the first job. Current employment shows Active and Exiting roles; Previous employment shows Closed roles. Each card shows employer, title, period, type where known, and explicit status. Multiple current roles are supported. Lists are ordered by descending start date.

Creation requires employer name, role/title, and start date. Optional type and unknown end dates are supported. Create/edit pages use phone-friendly date/select controls, field-associated errors, save/cancel actions, a saving state, and recoverable errors that preserve entered values. Successful saves navigate to a detail screen with confirmation. Marking a record Closed moves it into history; editing can correct any status. No deletion is implemented.

Home always says “No active exit process.” Employment status is only a worker-entered record attribute; it does not create an exit case or trigger settlement, pension, document, reminder, or Passport workflows. Exit, Documents, and Passport remain placeholders. Profile and authentication are unchanged. Employment subpages keep Home selected in the existing five-area navigation.

## Data and authorization

The additive migration `20261003020000_employment_records` creates `Employment`, status/type enums, its User foreign key, and an owner/status/start-date index. It does not change existing User or AuthSession columns/data. The schema includes IDs, owner, employer, role, start/end dates, optional type, status, and timestamps. Calendar dates use PostgreSQL DATE and serialize as YYYY-MM-DD without local time-zone shifts.

Shared Zod validation is used by the browser and server. Names are trimmed and bounded to 160 characters. Unknown payload keys (including ownership, IDs, and timestamps) are rejected. End dates cannot precede start dates; same-day employment is valid. Active records have no end date; Exiting/Closed can omit an unknown date. Future dates are allowed without automatic status changes.

`GET/POST /api/employments` and `GET/PUT /api/employments/:id` authenticate independently. Every database read and update includes the session owner's ID. Update ownership is checked atomically in the write predicate. Missing and foreign IDs both return 404. Writes require same-origin JSON and the existing streamed 4 KiB limit. Private responses disable caching, omit owner/user data, and return generic infrastructure errors. Pages authenticate before fetching records.

## Files created/changed

- `prisma/schema.prisma` and `prisma/migrations/20261003020000_employment_records/migration.sql`.
- New `src/modules/employments/validation.ts`, `service.ts`, `http.ts`, `page-user.ts`.
- New `src/app/api/employments/route.ts` and `[id]/route.ts`.
- Functional `src/app/(app)/page.tsx`; new employment new/detail/edit/not-found pages and `(app)/loading.tsx`, `(app)/error.tsx`.
- New `src/components/employment-card.tsx`, `employment-form.tsx`; Home active-state handling in `navigation.tsx`; employment-specific additions in `src/app/globals.css`.
- New `tests/employment.test.ts`, `employment-http.test.ts`, `employment.integration.test.ts`, `tests/e2e/employments.spec.ts`.
- README and architecture, domain, security, UI, testing, and milestone documentation, plus this implementation record.

No dependencies, environment variables, or infrastructure providers were added. Existing auth, Redis, S3, and CI abstractions remain intact.

## Validation

All checks passed without skipped tests:

| Command | Result |
| --- | --- |
| `npm run db:generate` | Prisma client generated |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 43 tests passed |
| `npm run build` | Production compilation passed |
| `npm run db:deploy` | All three committed migrations applied to disposable PostgreSQL 17 |
| `npm run test:integration` | 12 tests passed, including existing authentication/Redis tests |
| `npm run test:e2e` | 20 tests passed, including existing foundation checks |
| `npx prisma migrate diff --from-url postgresql://treviqo_test@127.0.0.1:55432/treviqo_test --to-schema-datamodel prisma/schema.prisma --exit-code` | No difference detected |
| `git diff --check` | Passed; repository implementation remains untracked as before |

Migration/integration/browser commands used explicitly exported `DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test` and `REDIS_URL=redis://127.0.0.1:56379`. These refer to disposable local PostgreSQL/Redis containers with synthetic data, not Rumpty or production credentials. Validation containers were removed afterward.

Unit checks cover date boundaries/leap dates, missing/invalid/oversized fields, status/type enums, owner injection, history grouping, unauthenticated requests, cross-origin requests, request-size limits, field guidance, and safe errors. Database tests verify owner isolation, rejected foreign updates and ownership reassignment, date round trips, history ordering, valid foreign keys, and unchanged records after rejected writes. Browser tests verify creation, editing, closing/history, cancellation, empty states, field errors, failed-save recovery, direct protected access, and cross-worker page/API isolation.

Responsive browser checks exercised form/detail/history at 320, 375, 430, and 1280px with no horizontal overflow. The 375px and 1280px history screenshots were visually inspected. Screenshots live under ignored `test-results/`. No validation failures were encountered in this milestone. Browser output includes the existing harmless color-environment warnings and an expected auth error log from the expired-session test.

## Deployment and limits

Run `npm run db:deploy` as the release migration step before deploying the new app to Rumpty. Existing PostgreSQL, Redis, canonical URLs, and session secret configuration still apply; employment records need no new secrets or providers. No production database or deployment was modified.

Physical-device/native date-picker checks and live Rumpty verification remain manual. Edits use last-save-wins semantics; no version-conflict UI, deletion, or pagination is included at this milestone. Drafts are retained while the form stays open after failure, not persisted across navigation or reload. Future dates do not trigger state transitions. Closing a record is not a verified exit or settlement result. The foundation's documented auth/dependency limitations remain unchanged.
