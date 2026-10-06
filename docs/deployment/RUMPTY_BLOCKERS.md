# Remaining Rumpty deployment blockers — 4 October 2026

Follow-up to [live verification](LIVE_RUMPTY_VERIFICATION.md). No public database/Redis endpoints, provider fallback, architecture change or Milestone 8 feature was introduced.

## Private PostgreSQL/Redis execution strategy

The supplied database/cache names belong to the Rumpty internal network. Failure to resolve them on a developer laptop is an expected network boundary, not evidence that Prisma or Redis is incompatible. Leave these services private.

After `npm run worker:build`, local diagnosis is:

```sh
node --env-file=.env --conditions=react-server dist-worker/ops/deployment.js --network-local
```

This mode prints variable names and DNS outcomes only. Exit 2 means an internal hostname requires Rumpty-network execution; exit 1 means missing/invalid configuration or another DNS failure; exit 0 means DNS resolved, **not** authentication or production acceptance. It does not require production app origins and cannot be combined with mutation/provider probes. Normal production preflight remains strict: real HTTPS origins and WORKER_REQUIRED=true are still required.

Prepare the existing `worker` and `migrate` Docker targets from the same approved candidate. Run an operator/release workload inside the **same Rumpty project/private network** as PostgreSQL and Redis. Inject credentials through console secret configuration; do not expose public ports or print environment dumps. The worker/operator image does not require an HTTP ingress. Supply production APP_URL plus the private database/cache variables for worker-scoped preflight.

Inside the operator workload:

```sh
npm run deployment:check -- --worker --inspect-db
```

This reports public table count and migration-history presence/count/unfinished state without reading worker records, exposing database names or changing data. Confirm the selected database's identity in the console; empty public schema is supporting evidence, not permission to overwrite another database. For an empty intended database, run the migration workload's `npm run db:deploy`. For existing data, first take and verify the backup below, inspect migration history/baseline and stop if unexpected. Never use reset/db push or invent a baseline.

Inside the migration workload:

```sh
npx prisma migrate status
npm run db:deploy
npx prisma migrate status
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Inside operator/worker workload afterward:

```sh
npm run deployment:check -- --worker --services
npm run worker
# In a separate console after both jobs have run:
npm run worker:health
```

For full bucket/public HTTPS checks, use an operator workload with web configuration and the documented `--services` / `--runtime` commands. No remote workload is claimed provisioned; console execution access is still required. No live migrations have been applied.

## S3 deletion diagnosis

Retried DeleteObject only for the known synthetic key; provider returned **403 AccessDenied** again. HeadObject for that same key returned 200, confirming object access. No object-lock/retention fields were returned in that metadata response; this does **not** prove absence of retention. GetBucketVersioning and GetObjectLockConfiguration both returned 403, so the credential cannot establish their state.

The narrow finding is a provider-side authorization/retention restriction on deletion; it is not a Treviqo route or frontend failure. Exact cause remains unknown: restricted key permissions, explicit bucket/prefix deny, object retention/lock or gateway policy require Rumpty-console/provider inspection. Do not change signing protocol, make the bucket public, grant unrestricted administrator access or bypass governance retention.

Operator steps:

1. In Rumpty, confirm the app key's principal and scope without copying credentials into logs. Check `s3:DeleteObject` on the intended bucket/object prefix and all explicit denies. Keep Put/Get/Delete limited to Treviqo objects; maintain private bucket/public-access restrictions.
2. Inspect versioning, object retention/legal hold and provider gateway restrictions using an authorized operator identity. Decide a retention policy intentionally; do not bypass a hold to make a smoke test pass. App DeleteObject may create only a delete marker in a versioned bucket; old versions/backups need separately authorized lifecycle handling.
3. Delete the exact residual test object after correcting authorization, then verify a previously signed GET cannot retrieve it. Recheck anonymous denial. Do not create additional probe objects until cleanup permission works.

Outstanding synthetic key (no personal data):
`deployment-probes/e8c9635a-b2f4-46c8-a135-d87549cbd7db.txt`

## Signed URL expiry diagnosis and handling

A fresh two-second signed URL was requested **directly from the configured S3 HTTPS origin**, with redirects disabled, after expiry. It returned **500 application/xml**. Treviqo was not running in or proxying that request path. The inspected response did not identify expiry/signature/access-denied wording. This locates the response at the provider endpoint/gateway; its internal cause cannot be determined here. Previously valid GET, unsigned 403 and tampered 403 establish that signing/access work separately from expiry handling.

Keep the short signature lifetime. Do not treat every 500 as ordinary expiry or as proof of successful privacy acceptance. Escalate the provider/gateway expiry behavior using a synthetic reproduction, without sharing signed URLs/keys. Successful post-expiry denial should use the documented provider contract; current strict deployment expiry acceptance remains failed.

Treviqo now removes a download link shortly before its local lifetime ends, rechecks expiry when the tab regains focus and before click, and offers an explicit fresh-link action. Timing starts before requesting the link to conservatively account for request latency. New issuance still authenticates/authorizes/rate-limits/audits. No automatic repeated signing, public URL or proxy is added. If the separate provider tab reports an error, users return to Treviqo and request a new link. Already-open tabs and copied links remain subject to provider enforcement; local timers are UX only, never authorization.

## Incremental AI diagnosis

Reproducible operator command after building:

```sh
node --env-file=.env --conditions=react-server scripts/rumpty-ai-stages.mjs
```

Uses only synthetic content, four sequential stages, bounded requests and no retries. Stops after the first failed stage and prints only status/timing/validation outcomes. It never prints credentials, endpoints or response contents and does not save trusted extracted fields.

| Stage | Live result |
| --- | --- |
| Minimal plain chat, no response_format, max_tokens=16 | Timed out at 25,004ms without an HTTP response. |
| Minimal JSON structured request | Not attempted: plain stage failed. |
| Application classification prompt/schema | Not attempted in this run: prerequisite failed. |
| Application extraction prompt/schema | Not attempted in this run: prerequisite failed. |

Earlier authenticated model discovery succeeded and the configured identifier was listed, but completion remains unverified. The plain request removes JSON/schema size as the immediate explanation; the timeout occurs before receiving a response even for minimal generation. Rumpty must inspect model loading/availability, inference routing, queue/capacity/credits and gateway connectivity. Do not assume that a longer timeout or changed prompt solves it. Production timeouts, grounding and schemas remain unchanged; manual review remains available. Rerun stages only after inference is healthy, then run six-type acceptance.

## Manual PostgreSQL backup/restore fallback

If managed snapshots/PITR are unavailable, use a **Rumpty-hosted maintenance workload** on the private database network with matching PostgreSQL client major version (verify server version first). This is an operational backup process, not a Treviqo product feature. No backup has yet been taken or restored.

Provide libpq variables PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD and provider-appropriate PGSSLMODE/certificate files via workload secrets. Do not pass a credential URL on command lines. Prisma URL parameters are not automatically valid libpq parameters. Use a restricted maintenance role capable of reading all required tables; test its privileges. Never disable TLS validation to resolve certificate errors. Disable shell tracing and restrict console/log access.

On a private persistent volume with permissions limited to the maintenance operator:

```sh
umask 077
pg_dump --format=custom --no-owner --no-acl --file=/backup/treviqo-pre-release.dump
pg_restore --list /backup/treviqo-pre-release.dump > /backup/treviqo-pre-release.contents
sha256sum /backup/treviqo-pre-release.dump > /backup/treviqo-pre-release.sha256
```

Check every command's exit status; abort rollout on failure. Use a distinct timestamped backup directory per run instead of overwriting the previous backup. Archive listing/checksum are integrity aids, not proof of restorability. Never store the dump in the repository, web filesystem or a public bucket. Encrypt at rest (verified Rumpty encrypted volume/private backup storage, or approved client-side encryption with keys stored separately), restrict download access, and copy off the ephemeral workload using the provider's private storage tooling. Do not rely on the currently deletion-blocked application bucket for retention management; provision a private backup destination with tested lifecycle/delete permissions. Record backup timestamp, database/server and migration version, checksum, storage location and operator without secrets.

Use pg_dump's consistent snapshot for PostgreSQL. Coordinate document-object snapshots/version inventory and retention as described in the existing runbook; a database dump alone cannot restore document bytes. For the first deployment pause app/worker writes during the coordinated database/object backup to simplify consistency. Keep app roles/grants/extensions provisioning scripts separately reviewed because `--no-owner --no-acl` does not restore grants/owners and a single-database dump excludes cluster roles.

Restore drill in a **new isolated private Rumpty database**, never the source:

```sh
# Configure libpq variables for the isolated restore target using its secret set.
# Independently confirm target identity before running this command.
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$PGDATABASE" /backup/treviqo-pre-release.dump
```

Restore into an empty, operator-provisioned database; do not add `--clean` against a live target. Reapply reviewed runtime grants, run migration status/drift checks, and perform the existing session revocation/job reset/object-reconciliation acceptance procedure with isolated Redis/bucket credentials before serving traffic. Start test web/worker only after these recovery steps. Measure RPO/RTO and record evidence; suggested 24-hour RPO/4-hour RTO remain targets until proven. Schedule and monitor daily dumps plus pre-migration backups, validate restore regularly, retain according to an explicit policy (initial proposal 30 days), test expiration/erasure and restrict every copy. Manual dumps provide no continuous PITR unless separate WAL archiving is configured and tested.

## Remaining acceptance blockers

Rumpty-network workload access and database state/migrations; real HTTPS app origin/WORKER_REQUIRED=true; scoped S3 deletion and residual-object cleanup; provider expiry 500; inference completion; configured private backups and a successful restore drill. No need to expose PostgreSQL/Redis publicly. Local private DNS limits are now reported separately from failures in the hosted environment.

## Validation

`npm run validate` passed lint, typecheck, **216 unit tests**, production build and worker/operator compilation. `npm run test:integration` passed **81 tests** against disposable local PostgreSQL/Redis. All nine migrations applied only to that disposable database. The read-only operator inspection reported 15 public tables, nine completed migrations and zero unfinished migrations. The real local private-network diagnostic returned exit 2 with both endpoints marked requires_rumpty_network. `npm run test:e2e` passed **50 browser tests**, including link expiry/removal and explicit renewal. Prisma drift reported no difference; `git diff --check` and staged-probe syntax validation passed. No live database mutations or public service exposure occurred.
