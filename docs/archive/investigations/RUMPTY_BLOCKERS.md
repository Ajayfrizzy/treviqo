# Rumpty deployment follow-up — 4 October 2026

> Historical incident findings extracted from the network/backup runbook during final documentation refinement. Observations and test counts retain their original date; they are not current blockers. See [current production evidence](../../deployment/RUMPTY_DEPLOYMENT.md#current-deployment-and-known-limitation) and [active recovery procedures](../../deployment/RUMPTY_BLOCKERS.md). Recent deletion success does not establish historical probe cleanup, expiry behavior or every AI acceptance check.

## S3 deletion diagnosis

Historical evidence — 4 October 2026; not current production status.

Retried DeleteObject only for the known synthetic key; provider returned **403 AccessDenied** again. HeadObject for that same key returned 200, confirming object access. No object-lock/retention fields were returned in that metadata response; this does **not** prove absence of retention. GetBucketVersioning and GetObjectLockConfiguration both returned 403, so the credential cannot establish their state.

The narrow finding is a provider-side authorization/retention restriction on deletion; it is not a Treviqo route or frontend failure. Exact cause remains unknown: restricted key permissions, explicit bucket/prefix deny, object retention/lock or gateway policy require Rumpty-console/provider inspection. Do not change signing protocol, make the bucket public, grant unrestricted administrator access or bypass governance retention.

Operator steps:

1. In Rumpty, confirm the app key's principal and scope without copying credentials into logs. Check `s3:DeleteObject` on the intended bucket/object prefix and all explicit denies. Keep Put/Get/Delete limited to Treviqo objects; maintain private bucket/public-access restrictions.
2. Inspect versioning, object retention/legal hold and provider gateway restrictions using an authorized operator identity. Decide a retention policy intentionally; do not bypass a hold to make a smoke test pass. App DeleteObject may create only a delete marker in a versioned bucket; old versions/backups need separately authorized lifecycle handling.
3. Delete the exact residual test object after correcting authorization, then verify a previously signed GET cannot retrieve it. Recheck anonymous denial. Do not create additional probe objects until cleanup permission works.

Outstanding synthetic key (no personal data):
The exact synthetic key is retained only in the private operator record; it is intentionally omitted from public documentation.

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

| Stage                                                 | Live result                                     |
| ----------------------------------------------------- | ----------------------------------------------- |
| Minimal plain chat, no response_format, max_tokens=16 | Timed out at 25,004ms without an HTTP response. |
| Minimal JSON structured request                       | Not attempted: plain stage failed.              |
| Application classification prompt/schema              | Not attempted in this run: prerequisite failed. |
| Application extraction prompt/schema                  | Not attempted in this run: prerequisite failed. |

Earlier authenticated model discovery succeeded and the configured identifier was listed, but completion remains unverified. The plain request removes JSON/schema size as the immediate explanation; the timeout occurs before receiving a response even for minimal generation. Rumpty must inspect model loading/availability, inference routing, queue/capacity/credits and gateway connectivity. Do not assume that a longer timeout or changed prompt solves it. Production timeouts, grounding and schemas remain unchanged; manual review remains available. Rerun stages only after inference is healthy, then run six-type acceptance.

## Historical acceptance blockers — 4 October 2026

Rumpty-network workload access and database state/migrations; real HTTPS app origin/WORKER_REQUIRED=true; scoped S3 deletion and residual-object cleanup; provider expiry 500; inference completion; configured private backups and a successful restore drill. No need to expose PostgreSQL/Redis publicly. Local private DNS limits are now reported separately from failures in the hosted environment.

## Historical validation — 4 October 2026

`npm run validate` passed lint, typecheck, **216 unit tests**, production build and worker/operator compilation. `npm run test:integration` passed **81 tests** against disposable local PostgreSQL/Redis. All nine migrations applied only to that disposable database. The read-only operator inspection reported 15 public tables, nine completed migrations and zero unfinished migrations. The real local private-network diagnostic returned exit 2 with both endpoints marked requires_rumpty_network. `npm run test:e2e` passed **50 browser tests**, including link expiry/removal and explicit renewal. Prisma drift reported no difference; `git diff --check` and staged-probe syntax validation passed. No live database mutations or public service exposure occurred.
