# Treviqo

Treviqo (treh-VEE-koh) is a worker-owned employment and benefits continuity platform. This repository currently implements the **Milestone 0 foundation**. Employment records, document uploads, AI extraction, exit workflows, and Benefit Passport are not implemented yet.

## Local setup

Use Node.js 22 LTS (see `.nvmrc`) and npm. Docker is optional for local PostgreSQL and Redis.

```sh
npm ci
cp .env.example .env
npm run dev
```

With empty integrations, the app renders a sign-in unavailable state; protected pages redirect to sign-in. No credentials are required to install, test, or build. Environment files are ignored by Git.

For local databases, fill `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` in `.env`, then run `docker compose up -d`. Set `DATABASE_URL` to your local PostgreSQL connection string (URL-encode credentials) and `REDIS_URL` to `redis://localhost:6379`. Prisma and Next.js read `.env`; integration tests expect variables exported in the shell.

```sh
npm run db:deploy
npm run dev
```

To enable sign-in, configure a **Rumpty-hosted OIDC identity service** and all auth variables from `.env.example`; see [deployment setup](docs/deployment/RUMPTY_DEPLOYMENT.md). No third-party hosted identity service is required. Never point tests at production.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types and strict TypeScript checks |
| `npm test` | Isolated unit/security tests |
| `npm run test:integration` | PostgreSQL/Redis tests; exported test URLs required |
| `npm run test:e2e` | Chromium shell, navigation, auth boundary, and responsive checks |
| `npm run build` | Generate Prisma client and production build |
| `npm start` | Run built app (set production environment, including HTTPS APP_URL) |
| `npm run validate` | Lint, typecheck, unit tests, build |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate -- --name <name>` | Create/apply a development migration |
| `npm run db:deploy` | Apply committed migrations without reset |

Install the browser once with `npx playwright install chromium`. CI runs all checks, migrations, integration tests, and browser tests. Browser tests use synthetic library-issued session cookies; they do not bypass production authorization or complete a real OIDC login.

## Structure

```text
src/app/                 App Router pages and API transport
src/components/          Shared mobile-first presentation
src/modules/auth/        OIDC, encrypted sessions, authorization helpers
src/server/config/       Validated server-only environment
src/server/db/           PostgreSQL/Prisma client
src/server/redis/        Lazy Redis connection
src/server/storage/      Explicit-endpoint private-storage boundary
prisma/                  Minimal User schema and versioned migrations
tests/                   Unit, service integration, browser checks
docs/                    Product, architecture,security, deployment guidance
```

Keep future business logic in `src/modules/<domain>` and validate authorization in every server/API operation. A protected page layout does not authorize an API endpoint.

## Deployment

The multistage [Dockerfile](Dockerfile) produces a non-root standalone Next.js runtime and a separate `migrate` target. Use Rumpty for all production infrastructure. See [deployment instructions](docs/deployment/RUMPTY_DEPLOYMENT.md) and the [foundation implementation record](docs/milestones/FOUNDATION.md).

`GET /api/health` is process liveness; `GET /api/ready` checks the migrated database, Redis, bucket connectivity, and auth configuration. Readiness returns generic `503` responses when integrations are missing or unreachable. It does not prove OIDC availability or bucket privacy.
