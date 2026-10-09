# Responsive action and loading-state polish — 9 October 2026

## Scope and affected components

- `src/app/globals.css`: responsive content sizing, compact equal-width pairs,
  wrapping groups, consistent button/link padding and minimum height, outlined
  Cancel, shared destructive treatment, local status spacing.
- `src/components/button.tsx`: optional action-specific pending label using the
  existing promise lifecycle and duplicate-click guard.
- `auth-actions.tsx`: accurate cancellation pending copy.
- `document-actions.tsx`: download/deletion labels and destructive confirmation.
- `document-upload.tsx`: progress immediately beneath its initiating action group.
- `extraction-review.tsx`: extraction/manual/refresh/review labels, adjacent progress
  track, removal of page-wide local-mutation loading text.
- `finance-review.tsx` and `passport-entry.tsx`: local pending labels, shared removal
  treatment, only the submitting form says Saving, no page-wide mutation progress.
- `reminders.tsx`: local refresh/snooze/dismiss labels.
- Shared CSS also affects employment, Exit, Profile/account deletion and links;
  their backend/request behavior is unchanged.
- Browser suites and `tests/helpers/responsive-actions.ts`: all seven requested
  widths, target/clipping assertions and delayed-request regressions.
- `docs/ui/UI_UX.md` and `docs/testing/TESTING.md`: current design/testing guidance.

No backend, domain, AI, schema, migration or environment-file changes. No commit,
push or deployment. Tests use disposable local services, never live data/inference.

## Validation

Commands requiring services used these disposable overrides (not `.env` values):

```sh
export DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55439/treviqo_test
export REDIS_URL=redis://127.0.0.1:56389
npm run db:deploy
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run test:e2e -- tests/e2e/documents.spec.ts tests/e2e/finance.spec.ts --grep 'local upload|pension save feedback'
npm run build
npm run worker:build
```

- Existing migrations applied successfully to the disposable database.
- Lint and TypeScript passed; 316 unit tests passed across 25 files.
- The final full browser run passed 122 cases. Its three new alert-selector
  failures were fixed; the focused command above then passed all three. All 125
  distinct cases are verified, with no unresolved browser failures.
- Final production build and worker build passed.
- `git diff --check` and targeted `npx prettier --check` covered the changed CSS,
  components, browser specs, responsive helper and this report.

The first browser run had seven extraction-history selector failures: the test
looked for the idle button label while the UI correctly displayed Extracting.
Those assertions were corrected and passed at all seven widths in the next run.
Three new delayed-request cases initially matched both the form alert and Next.js's
route announcer; assertions now target alerts inside the main content. No
application changes were needed for those test fixes. The focused rerun passed all
three cases. Disposable test containers were stopped and removed afterward.

Screenshot inspection covered mobile/desktop document actions, employment pairs,
extraction review and active extraction progress, and desktop finance actions.
Automated layout checks cover every requested width: 320, 375, 430, 768, 1024,
1280 and 1440px. Browser journeys generate screenshots under ignored `test-results/`; Playwright
clears prior artifacts when a subsequent run starts.

Physical touch devices, Safari/Firefox, live Rumpty services and the separate
production-navigation timing suite were not exercised. Service integration suites
were not rerun for this UI-only pass; browser tests exercised real local application
routes with disposable data and fixture storage/inference. Development runs emitted
non-failing Next.js stream-close and color-environment warnings; simulated failure
cases also intentionally log unavailable inference/authentication.
