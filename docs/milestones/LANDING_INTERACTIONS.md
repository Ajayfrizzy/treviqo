# Landing interactions — 10 October 2026

Added selectable Employment/Documents/Next chapter hero examples and expandable
How it works steps. Short transitions and CTA arrow feedback make exploration
responsive without automatic cycling. All content remains clearly illustrative.

Affected components/files:
- `src/components/public-previews.tsx`: HeroPreview and JourneyPreview client islands.
- `src/components/public-landing.tsx`: composes those islands into the existing page.
- `src/app/public.css`: scoped controls, transitions, responsive wrapping.
- `tests/e2e/public-motion.spec.ts`: seven responsive interaction cases.
- `docs/ui/UI_UX.md`: interaction/accessibility guidance.

The public page remains statically prerendered. No backend, domain, AI, auth,
routing, schema, environment or dependency changes. No commit, push or deployment.

Validation:
- `npm run validate`: lint, TypeScript, 319 unit tests across 26 files, production
  build and worker build passed.
- `npm run lint && npm run typecheck`: passed after adding browser coverage.
- `npm run test:e2e -- tests/e2e/public-motion.spec.ts tests/e2e/public-onboarding.spec.ts`:
  all eight existing onboarding/profile cases passed. Seven new cases initially
  failed because their bounding-box read preceded the streamed landing content.
  Fixed by waiting for the preview and fonts before measurement.
- `npm run test:e2e -- tests/e2e/public-motion.spec.ts --output=test-results/motion-retry`:
  seven passed; verifies chapter selection, keyboard activation/focus, stable hero height,
  expanded steps, reduced motion, tap targets, overflow and browser errors at
  320, 375, 430, 768, 1024, 1280 and 1440px.

Tests use disposable loopback PostgreSQL/Redis and fixture S3/AI; existing
migrations applied only to the disposable database. Initial sandbox networking
blocked migration execution; rerunning with local-service access succeeded.
Screenshots captured at all seven widths. Physical-device, Safari/Firefox,
unrelated integration and full browser regression suites were not rerun for
these isolated landing components.
