# Rumpty network and backup recovery procedures

Use these procedures for separately authorized maintenance or recovery. [Current production evidence](RUMPTY_DEPLOYMENT.md#current-deployment-and-known-limitation) is maintained in the deployment runbook; the [4 October incident findings and validation](../archive/investigations/RUMPTY_BLOCKERS.md) are archived.

DNS and schema inspection below are read-only. Migration, service probes, starting workers, backups and restore drills are separate operator actions; this guide does not authorize their execution.

## Private PostgreSQL/Redis execution strategy

For endpoints configured on the Rumpty internal network, names may resolve only within that network. Failure to resolve them on a developer laptop is an expected network boundary, not evidence that Prisma or Redis is incompatible. Leave these services private.

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
# In a separate console after all four configured job sweeps have completed:
npm run worker:health
```

For full bucket/public HTTPS checks, use an operator workload with web configuration and the documented `--services` / `--runtime` commands. The original 4 October investigation provisioned no remote workload and applied no live migrations. These are separately authorized operator procedures, not current deployment status. If Rumpty provides no runtime console or one-off workload, ask support to execute the required checks in the same network/role context.

## Storage troubleshooting

For a pending deletion, use [verified deletion recovery](DOCUMENT_DELETION_RECOVERY.md); for a separately authorized disposable test, use the [guarded S3 probe](S3_DELETE_PROBE.md). Never treat HTTP 403 or a signed-link failure as proof of absence, broaden access speculatively or bypass retention.

Keep signed-link lifetimes short. If expiry produces an unexpected provider error, collect only sanitized status/timing and ask support to inspect it; do not publish signed URLs. Users can return to Treviqo and request a fresh authorized link. Local link-expiry timers are UX, not authorization; copied links remain subject to provider enforcement. The earlier expiry 500 is a dated observation in the archive, not a newly reproduced result.

## Incremental AI diagnosis

After separate authorization for synthetic inference, build the worker/operator tools and run:

```sh
node --env-file=.env --conditions=react-server scripts/rumpty-ai-stages.mjs
```

The script uses synthetic content, bounded requests and no retries, stopping at the first failed stage. It prints status/timing/validation outcomes rather than credentials, endpoints or model contents. This invokes inference and is not a read-only readiness check. Keep manual review available; do not assume longer timeouts fix a provider failure. Use the [current AI contract](../ai/AI_DOCUMENTS.md#current-implementation) and [release acceptance](FIRST_RUMPTY_DEPLOYMENT.md#controlled-live-probes), not the archived six-type acceptance scope.

## Manual PostgreSQL backup/restore fallback

If managed snapshots/PITR are unavailable, use a **Rumpty-hosted maintenance workload** on the private database network with matching PostgreSQL client major version (verify server version first). This is an operational backup process, not a Treviqo product feature. This procedure does not establish that a backup or restore drill has succeeded. Record that evidence separately.

Provide libpq variables PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD and provider-appropriate PGSSLMODE/certificate files via workload secrets. Do not pass a credential URL on command lines. Prisma URL parameters are not automatically valid libpq parameters. Use a restricted maintenance role capable of reading all required tables; test its privileges. Never disable TLS validation to resolve certificate errors. Disable shell tracing and restrict console/log access.

On a private persistent volume with permissions limited to the maintenance operator:

```sh
umask 077
pg_dump --format=custom --no-owner --no-acl --file=/backup/treviqo-pre-release.dump
pg_restore --list /backup/treviqo-pre-release.dump > /backup/treviqo-pre-release.contents
sha256sum /backup/treviqo-pre-release.dump > /backup/treviqo-pre-release.sha256
```

Check every command's exit status; abort rollout on failure. Use a distinct timestamped backup directory per run instead of overwriting the previous backup. Archive listing/checksum are integrity aids, not proof of restorability. Never store the dump in the repository, web filesystem or a public bucket. Encrypt at rest (verified Rumpty encrypted volume/private backup storage, or approved client-side encryption with keys stored separately), restrict download access, and copy off the ephemeral workload using the provider's private storage tooling. Do not infer backup retention management from application document-deletion success; use a private backup destination with tested lifecycle/delete permissions. Record backup timestamp, database/server and migration version, checksum, storage location and operator without secrets.

Use pg_dump's consistent snapshot for PostgreSQL. Coordinate document-object snapshots/version inventory and retention as described in the existing runbook; a database dump alone cannot restore document bytes. For the first deployment pause app/worker writes during the coordinated database/object backup to simplify consistency. Keep app roles/grants/extensions provisioning scripts separately reviewed because `--no-owner --no-acl` does not restore grants/owners and a single-database dump excludes cluster roles.

Restore drill in a **new isolated private Rumpty database**, never the source:

```sh
# Configure libpq variables for the isolated restore target using its secret set.
# Independently confirm target identity before running this command.
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$PGDATABASE" /backup/treviqo-pre-release.dump
```

Restore into an empty, operator-provisioned database; do not add `--clean` against a live target. Reapply reviewed runtime grants, run migration status/drift checks, and perform the existing session revocation/job reset/object-reconciliation acceptance procedure with isolated Redis/bucket credentials before serving traffic. Start test web/worker only after these recovery steps. Measure RPO/RTO and record evidence; suggested 24-hour RPO/4-hour RTO remain targets until proven. Schedule and monitor daily dumps plus pre-migration backups, validate restore regularly, retain according to an explicit policy (initial proposal 30 days), test expiration/erasure and restrict every copy. Manual dumps provide no continuous PITR unless separate WAL archiving is configured and tested.
