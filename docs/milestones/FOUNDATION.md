# Milestone 0 implementation record

Repository foundation implemented on October 3, 2026. **The milestone's live Rumpty success criterion remains pending real infrastructure configuration and deployment.** Nothing was committed or pushed.

## Architecture and scope

Next.js 16 / React 19, strict TypeScript, App Router, and Node.js route handlers form a modular monolith. Mobile bottom navigation and a desktop sidebar expose Home, Exit, Passport, Documents, and Profile. Feature areas remain placeholders, with shared loading/error/empty states and a signed-in profile state.

Server-only modules provide validated configuration, lazy PostgreSQL/Prisma and Redis clients, a private S3 connectivity boundary, application-managed credentials authentication, encrypted sessions, ownership checks, and a Redis auth request circuit-breaker. Health, readiness, and current-user endpoints establish API conventions. There is no document access/upload, extraction, settlement, exit workflow, or Passport implementation.

## Files

- Root: `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.integration.config.ts`, `playwright.config.ts`, `.nvmrc`, `.gitignore`, `.env.example`, `.dockerignore`, `Dockerfile`, `compose.yaml`, `README.md`.
- Application: `src/app/layout.tsx`, `globals.css`, `tokens.css`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `sign-in/page.tsx`, `(app)/layout.tsx`, and the five section pages.
- APIs: `src/app/api/auth/[...nextauth]/route.ts`, `api/me/route.ts`, `api/health/route.ts`, `api/ready/route.ts`.
- Components: `src/components/navigation.tsx`, `auth-actions.tsx`, `placeholder.tsx`.
- Server: `src/server/config/env.ts`, `db/client.ts`, `redis/client.ts`, `storage/client.ts`, `readiness.ts`.
- Auth: `src/modules/auth/options.ts`, `session.ts`, `rate-limit.ts`, `types.d.ts`.
- Database: `prisma/schema.prisma`, `prisma/migrations/migration_lock.toml`, `prisma/migrations/20261003000000_foundation/migration.sql`.
- Validation: `.github/workflows/ci.yml`, `tests/env.test.ts`, `auth.test.ts`, `readiness.test.ts`, `storage.test.ts`, `services.integration.test.ts`, `server-only.ts`, `e2e/foundation.spec.ts`.
- Static root: `public/.gitkeep`.
- Documentation updated: architecture, deployment, security, testing, milestone plan, this record, and README. Existing instructions and repo skills were read and preserved.

## Dependencies

| Packages | Reason |
| --- | --- |
| `next`, `react`, `react-dom` | Application and mobile UI |
| `next-auth` | Credentials, CSRF, and encrypted-session implementation |
| `argon2` | Salted Argon2id password hashing and verification |
| `@prisma/client`, `prisma` | PostgreSQL access, generation, migrations |
| `ioredis` | Redis connection and atomic auth rate limiter |
| `@aws-sdk/client-s3` | S3 protocol client with mandatory Rumpty endpoint; no AWS infrastructure provisioned |
| `zod`, `server-only` | Environment validation and client/server import isolation |
| TypeScript and Node/React types | Strict compile-time checks, Node 22 runtime alignment |
| ESLint / Next.js ESLint config | Source validation |
| Vitest | Unit/security and service integration tests |
| Playwright | Responsive browser and authorization-boundary checks |

The lockfile makes installation reproducible. A `deepmerge-ts` override to patched 8.x removes the Prisma configuration dependency advisory; generation, migrations, and builds were verified with that override. Prisma 6 was selected for its stable Node/PostgreSQL setup without an additional driver adapter.

## Database and environment

The original migration created `User` with issuer/subject identity. The additive `20261003010000_credentials_auth` migration preserves these legacy fields as nullable, adds unique email and passwordHash, and creates revocable `AuthSession` records. New credentials accounts require no external identity. It applied successfully to disposable PostgreSQL 17, reapplied without pending changes, and matched the Prisma schema exactly. No production database was accessed.

`.env.example` contains only blanks and safe local/default values. Runtime variables: `APP_URL`, `NEXTAUTH_URL`, `SESSION_SECRET`, `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`. Local Compose additionally uses `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. Deployment instructions explain each variable. AI variables are deferred until inference is implemented.

## Original foundation validation results (before credentials correction)

| Command/check | Final result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 17 tests passed |
| `npm run build` | Passed, including a Node 22 Linux Docker build |
| `npm run db:deploy` | Migration applied, subsequent runs had no pending migrations |
| `npm run test:integration` | 3 tests passed against disposable PostgreSQL/Redis |
| `npx prisma migrate diff --from-url postgresql://treviqo_test@127.0.0.1:55432/treviqo_test --to-schema-datamodel prisma/schema.prisma --exit-code` | No difference detected |
| `npx playwright install chromium` | Browser available |
| `npm run test:e2e` | 11 tests passed; 320/375/430/1280px |
| `docker build --progress=plain --target runtime -t treviqo:milestone-0 .` | Passed |
| `docker build --target migrate -t treviqo:migrate-0 .` | Passed |
| `docker run --rm -e DATABASE_URL=postgresql://treviqo_test@host.docker.internal:55432/treviqo_test treviqo:migrate-0` | Passed; no pending migrations |
| Production container smoke checks | Health 200, readiness 503 without credentials, current user 401, sign-in 200, browser redirect to sign-in, UID 1001 |
| `npm audit --omit=dev` | Zero vulnerabilities |
| `npm audit --json` | Five high development-only advisory entries from the unpatched `braces` dependency chain in Next.js lint tooling |
| `git diff --check` | Passed (new application files are untracked) |

Local service commands used `DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test` and `REDIS_URL=redis://127.0.0.1:56379`. These were isolated test containers using a synthetic trust-auth database, not credentials or production configuration. Temporary validation containers were removed afterward.

Initial failures were fixed: a TypeScript environment-input typing mismatch; an integration-config merge that selected unit tests instead; a Playwright locator that also matched Next.js's route announcer; and the Next.js dev badge intercepting mobile Home clicks. The first Docker dependency download failed on the network and succeeded on retry. An HTTP-only production smoke assertion expected 307; Next.js streamed a redirect instead, verified successfully in Chromium. Sandbox restrictions on npm/Prisma were resolved through approved tool execution.

Mobile (375px) and desktop (1280px) screenshots were visually inspected. Automated checks cover all five navigation destinations, active state, horizontal overflow, keyboard skip links, mobile bottom positioning, missing/expired authentication, and safe sign-in error copy. No tests were skipped. Physical-device checks were not performed. The original provider-based auth checks are superseded by the credentials correction tests below.

## Remaining configuration and deliberate decisions

- Supply Rumpty app, PostgreSQL, Redis, and private bucket configuration; deploy and validate real sign-in/sign-out, TLS, private bucket policy, monitoring, and backup restore.
- Authentication is application-managed credentials authentication hosted with Treviqo on Rumpty Cloud, backed by Treviqo PostgreSQL. No managed identity service is assumed. Rumpty PostgreSQL, Redis 8.1, S3-compatible storage, AI inference, and app compute are confirmed available.
- Eight-hour encrypted sessions now reference PostgreSQL records checked on every authenticated session lookup. Logout revokes the current session, including copied cookies. No email verification, recovery, MFA, or social login is implemented.
- Storage intentionally exposes connectivity only. Object authorization, signed access, MIME/size checks, and private uploads must be implemented together in Milestone 2.
- The shell requested here brings the planned Milestone 1 navigation forward without implementing employment records or onboarding.
- The default app remains unavailable for sign-in until configured. No development login bypass, fabricated endpoint, competing infrastructure provider, or live deployment claim was introduced.
- Full audit remains nonzero because the latest `braces` release is still affected. Retain the current Next.js-compatible lint tooling, track its upstream fix, and do not apply the audit suggestion to downgrade Next.js tooling across major versions. Runtime dependency audit is clean.

## Targeted credentials correction — October 3, 2026

The unsupported identity-service assumption is removed. Authentication now runs entirely in Treviqo's Rumpty-hosted application, PostgreSQL, and existing Redis integration. NextAuth remains the session/CSRF library. `argon2` is the only new direct dependency (Argon2id with 64 MiB, three iterations, one lane and random salts). No hosted auth, email, or infrastructure provider was added.

### Changed files for this correction

- `src/modules/auth/options.ts`, `rate-limit.ts`; new `credentials.ts`, `password.ts`, `session-store.ts`, `request.ts`.
- `src/app/api/auth/[...nextauth]/route.ts`; new `src/app/api/register/route.ts`, `src/app/register/page.tsx`.
- `src/components/auth-actions.tsx`, `src/app/sign-in/page.tsx`, `src/app/globals.css` (form styling only; navigation/shell unchanged).
- `src/server/config/env.ts`, `.env.example` (remove OIDC variables).
- `prisma/schema.prisma`; new `prisma/migrations/20261003010000_credentials_auth/migration.sql`. The original migration is unchanged.
- `package.json`, `package-lock.json` (Argon2).
- `tests/auth.test.ts`, `tests/services.integration.test.ts`, `tests/e2e/foundation.spec.ts`, `playwright.config.ts`; new `tests/password.test.ts`, `tests/registration.test.ts`, `tests/production-smoke.mjs`.
- `AGENTS.md` clarifies the explicitly authorized distinction between password hashes and forbidden plaintext credentials. README, architecture, security, deployment, testing, milestone plan, and this record reflect the correction.

### Data and session behavior

`User.id` remains provider-independent. New accounts have normalized unique emails and password hashes. Existing nullable issuer/subject fields are retained to avoid discarding legacy records; they are not required for registration. No invented credentials, automatic identity linking, or production data edits were performed. Future OAuth identities can reference existing IDs without changing domain ownership.

`AuthSession` has an internal ID, user foreign key, creation time, and absolute eight-hour expiry. NextAuth's encrypted cookie references it. Every authorized session lookup checks existence, owner, and expiry. Logout deletes the current row and removes the browser cookie; replayed copies stop working. Password hashes and session IDs never appear in public session/API JSON. The secret remains environment-only. Other devices' sessions are not revoked by single-device logout; rotating the secret invalidates all cookies.

Registration uses same-origin JSON, bounded request bodies, generic duplicate errors, and hashing before persistence. Login has generic errors and dummy hashing for absent users. Redis retains its original adapter, global limiter, and infrastructure role; an additional HMAC-keyed per-email limiter permits 10 attempts per 15 minutes. Authentication fails closed if the limiter is unavailable. Rumpty Redis 8.1 is confirmed available; local validation used Redis 8, while existing Compose/CI Redis 7 definitions remain unchanged for compatibility coverage.

### Correction validation

Commands below ran with disposable local services, not production. Exact test URLs are synthetic trust-auth local endpoints, not secrets.

```sh
npm run db:generate
npm run lint
npm run typecheck
npm test
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test npm run db:deploy
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test REDIS_URL=redis://127.0.0.1:56379 npm run test:integration
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test REDIS_URL=redis://127.0.0.1:56379 npm run test:e2e
npm run build
DATABASE_URL=postgresql://treviqo_test@127.0.0.1:55432/treviqo_test npx prisma migrate diff --from-url postgresql://treviqo_test@127.0.0.1:55432/treviqo_test --to-schema-datamodel prisma/schema.prisma --exit-code
docker build --progress=plain --target runtime -t treviqo:credentials .
docker build --target migrate -t treviqo:credentials-migrate .
docker run --rm -e DATABASE_URL=postgresql://treviqo_test@host.docker.internal:55432/treviqo_test treviqo:credentials-migrate
docker exec -i treviqo-auth-web node --input-type=module < tests/production-smoke.mjs
npm audit --omit=dev
git diff --check
```

Results: lint and typecheck passed; **25 unit tests, 7 integration tests, and 13 browser tests passed**; production build and both Docker targets passed. Both migrations applied, schema comparison reported no difference, and the migration image reported no pending changes. Production smoke exercised Argon2 registration, credentials login, protected API access, Secure/HttpOnly/SameSite cookies, logout, copied-cookie rejection, and non-root UID 1001. The image used a generated ephemeral secret, an HTTPS test origin, and disposable PostgreSQL/Redis endpoints; no secret was printed or saved in source.

Browser tests cover success/duplicate/invalid login flows, persisted sessions, unauthenticated and expired session rejection, CSRF and Origin protections, safe public serialization, copied-cookie rejection after logout, and all five navigation destinations. Registration, sign-in, and shell layouts fit 320/375/430/1280px. No tests were skipped. Initial TypeScript literal/callback fixture errors and an Argon2 parameter-order assertion were fixed before the final pass. Production audit reports zero vulnerabilities; the pre-existing five development-only lint-chain advisory entries remain.

### Deployment requirements and limitations

Supply real Rumpty PostgreSQL/Redis/S3 connections, canonical HTTPS `APP_URL`/`NEXTAUTH_URL`, and a generated `SESSION_SECRET`; apply migrations using the release image, configure ingress protections, and verify TLS, monitoring, private storage, and backup restore. Benchmark Argon2 concurrency/memory on the selected app plan. Provision expiry cleanup for session rows. The live Rumpty deployment remains unperformed because configuration was not supplied.

Email verification, forgotten-password email, account recovery, MFA, social login, and password changes remain deferred. Email is an unverified login identifier. Duplicate registration can reveal account existence through status differences; login errors are generic. Per-account limits can temporarily block a targeted account; add trusted per-client ingress controls. Legacy identity-only accounts are preserved without automatic credentials conversion. Expired session rows are rejected immediately but need periodic cleanup. No later product features were implemented; the mobile shell and PostgreSQL/Redis/S3 infrastructure abstractions remain intact.
