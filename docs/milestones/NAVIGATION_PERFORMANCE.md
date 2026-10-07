# Navigation performance — 7 October 2026

## Changes

- `src/modules/auth/session.ts`: React request-scoped memoization shares the authenticated user lookup during a server render. Session expiry/revocation and ownership checks remain in place; there is no persistent authentication cache.
- `src/app/(app)/page.tsx`: start employment and exit queries together; stream their sections independently behind Suspense while showing the heading and reminders link.
- `src/app/(app)/documents/page.tsx`: fetch employments and documents concurrently, retaining filter ownership checks and the 404 response.
- `src/components/navigation.tsx`: fully prefetch only the five primary tab destinations.
- `src/components/extraction-review.tsx`: refresh the router after successful classification/review changes to invalidate prefetched content. Existing employment/exit/document save and deletion flows retain their own navigation/refresh ordering.
- `tests/e2e/navigation.spec.ts`, `playwright.navigation.config.ts`, `tests/fixtures/navigation-{https,server}.mjs`: exercise navigation in development and against the deployed standalone build. Production checks observe streamed destination content before clicking, then verify employment changes appear in Home, Documents and Passport, plus logout protection.
- `.github/workflows/ci.yml`: run the production navigation check before the full browser suite.
- `docs/testing/TESTING.md`: document the local production test setup.

No dependencies, migrations, domain-rule changes, persistent data caches, or infrastructure changes were introduced. The `.env` file was not edited.

## Validation

All database/browser checks used disposable loopback PostgreSQL/Redis and synthetic users; storage/AI browser tests used existing fixtures.

- `npm run validate`: passed lint, TypeScript, 262 unit tests, production build and worker build.
- `npm run db:deploy`: all 10 existing migrations applied to the disposable database.
- `npm run test:integration`: 94 tests passed across 9 files, including authentication, revocation and ownership.
- `npm run test:e2e`: 87 tests passed in 4.7 minutes, covering authentication/account deletion, employment, documents, extraction, Exit, finance, Passport, reminders, failure recovery and mobile/desktop layouts.
- `npx playwright test --config playwright.navigation.config.ts`: 2 production tests passed at 375px and 1440px. The complete destination content arrived during prefetch before the first tab click.
- Final `npm run lint`, `npm run typecheck`, targeted `npx prettier --check`, and `git diff --check`: passed.

An early broad mutation-refresh approach interfered with document deletion navigation and was removed. The corrected implementation passed the full browser rerun. The production test also needed Chromium stream observation because consumed/cancelled Flight streams are not reliably available through Playwright's `response.text()`.

## Observed timings and limits

One local standalone production run measured click-to-heading time, including Playwright action/assertion overhead:

| Viewport | Exit | Passport | Documents | Profile | Home |
| --- | --- | --- | --- | --- | --- |
| 375px | 80 ms | 58 ms | 61 ms | 50 ms | 48 ms |
| 1440px | 51 ms | 48 ms | 49 ms | 53 ms | 62 ms |

These are warm-prefetch local measurements, not a before/after speedup claim or a Rumpty latency benchmark. Full prefetching trades background requests for faster tab changes. There is no live cross-device synchronization; normal router-cache freshness still applies to changes made elsewhere.

Live Rumpty app-to-database latency, query plans with representative data, slow-network/physical-device behavior and cold starts remain deployment checks. Existing query indexes and the shared Prisma client were retained; there was no measured basis for changing pooling, adding indexes, or introducing pagination in this navigation fix. Production deployment was not performed.
