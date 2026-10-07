# UI interaction refinement — 7 October 2026

Follow-up to the production polish, covering all existing app areas. The referenced images were not attached to the request; implementation follows the written descriptions and inspection of current screens. The user clarified that model, prompt and schema details should be removed from the user-facing review screen.

## Changes

- Equal-width Save/Cancel controls, matching green/white colors, distinct Cancel border/weight, retained disabled Cancel during saves, and narrow-screen label wrapping.
- Consistent gaps around review actions, refresh controls, form actions and links following cards. Applied across employment, Exit, upload, extraction, settlement and benefit review.
- Shared async Button: clicked-control spinner, disabled state and immediate repeat-click protection; pressed styling for synchronous buttons and navigation. Existing global busy states still protect sibling actions.
- Shared navigation link feedback using Next.js useLinkStatus. Document filtering and error retries expose transition state. Section loading uses a spinner, clear heading, supporting copy, progress track and skeletons with reduced-motion support.
- Removed technical extraction details from the UI while keeping original evidence, provenance and review history available. No AI/inference fixes or domain/API changes.

## Validation

Lint, TypeScript, 239 unit tests and the initial production/worker builds passed. All 82 integration tests and all 78 full-suite browser tests passed. All eight final narrow-label layout and delayed-navigation checks passed (seven viewport reruns and one additional navigation scenario), bringing the unique browser coverage to 79 passing scenarios. No tests failed or were skipped. The final production build, formatting check and diff check also passed. Tests use only disposable local PostgreSQL/Redis and synthetic storage/AI fixtures. Added browser checks for equal-width action geometry/colors/gaps across seven widths and delayed extraction/save feedback, repeat-click prevention, retry recovery, and retained source excerpts without technical metadata.

Exact commands (service tests use disposable URLs):

```sh
npm run format:check
npm run validate
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test npm run db:deploy
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test REDIS_URL=redis://127.0.0.1:56379 npm run test:integration
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test REDIS_URL=redis://127.0.0.1:56379 npm run test:e2e
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test REDIS_URL=redis://127.0.0.1:56379 npm run test:e2e -- tests/e2e/employments.spec.ts tests/e2e/foundation.spec.ts --grep 'employment creation, editing and history|slow navigation' --output=/tmp/treviqo-interactions-recheck
npm run build
git diff --check
```

Screenshots under ignored `test-results/` include equal-width actions, pending review controls and navigation feedback. Visually inspected 320px Save/Cancel and pending review controls, plus 375px navigation feedback. A visual inspection at 320px caught a mid-word button-label wrap; reduced inline padding fixed it and the updated screenshot was rechecked. No backend/schema changes were required. Both task-owned test containers were removed after validation.

## Limits

Physical-device, native picker and screen-reader checks remain manual. The actual screenshots can be compared later if supplied. No commit, push or deployment was requested or performed; Rumpty inference 503 remains outside this pass.
