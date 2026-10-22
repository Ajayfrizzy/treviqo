# Guarded S3 deletion probe

Active operator procedure extracted from the [18 October investigation](../archive/investigations/S3_DELETE_AUTHORIZATION_INVESTIGATION.md). See [current production evidence](RUMPTY_DEPLOYMENT.md#current-deployment-and-known-limitation) before deciding whether a new probe is necessary. This procedure makes disposable-object mutations and is never a read-only health check.

## Reviewable, explicit operator probe

Review `src/ops/s3-delete-probe.ts` and `src/ops/s3-delete-probe-cli.ts`, then build:

```sh
npm run worker:build
```

The compiled CLI is included in the worker/operator artifact; it is never invoked
by the worker loop, build, health check or deployment check. Running without the
exact execution flags fails before constructing a client or making requests.

Provision or designate a **private test bucket** in Rumpty. Independently verify
public-access restrictions and intended ownership in the console. Supply these
variables through a restricted operator workload/secret environment, not command
arguments, shell tracing, debug logs or source control:

- `PROBE_S3_ENDPOINT`, `PROBE_S3_REGION`, `PROBE_S3_BUCKET`
- `PROBE_S3_ACCESS_KEY_ID`, `PROBE_S3_SECRET_ACCESS_KEY` (static scoped pair)
- `PROBE_S3_FORCE_PATH_STYLE` (`true` default, matching intended provider setup)
- `PROBE_CONFIRM_BUCKET` (must equal the selected probe bucket)
- `PROBE_TARGET=private-test`

The CLI does not load `.env` automatically or fall back to `S3_*`/AWS credentials.
Review bucket-level default retention before authorizing a PUT: a retained probe
may require later operator cleanup. Scope object permissions to the diagnostic
namespace in the source. Bucket-level diagnostic reads may be denied without
preventing the ordinary DELETE experiment. Do not grant administrator access to
make diagnostic checks green.

**Operator-only command. Requires explicit authorization, a designated private test bucket and a cleanup plan:**

```sh
node --conditions=react-server dist-worker/ops/s3-delete-probe-cli.js --test-bucket --execute
```

Sequence:

1. Read bucket versioning and Object Lock configuration. Report denial/unsupported
   responses as unknown, never as disabled.
2. HEAD a never-written sibling under a new random UUID namespace.
3. PUT one small private disposable text object using the application's parameters.
4. GET and compare bounded contents, then HEAD the object; inspect retention/legal
   hold through read-only APIs. No user content is involved.
5. Issue ordinary DeleteObject with only Bucket and Key, then HEAD independently.
6. Inspect versions/markers under only the exact generated key. At most three
   bounded passes remove only exact matching version IDs. Stop on incomplete,
   malformed or unrelated inventory, or a denied exact-version delete. Never bypass
   governance retention or clear legal holds. A failed PUT may have stored bytes,
   so cleanup still inspects only this run's generated key.
7. Final HEAD and summary separate ordinary DELETE/current-absence success from
   verified cleanup of retained versions. A 403 is always inconclusive for absence.
   Exit 0 requires ordinary deletion/content verification and verified cleanup;
   otherwise exit 1 and operator follow-up. Successful HEAD/DELETE alone is insufficient.

JSON lines contain operation, HTTP status, safe error category/code, booleans/counts,
and a synthetic run UUID. They contain no bucket/key, connection URL, raw provider
message, request/response body, credentials, signature or version IDs. Use the run
UUID and the source's fixed path template to locate **only that probe** privately
if cleanup fails or the process is interrupted. Do not repeatedly create more
objects after a cleanup failure. Nothing enumerates user documents, and there is
no arbitrary-key cleanup argument.

**A passing test bucket does not prove production bucket or user-prefix policy.**

### Separately authorized production disposable probe

This procedure does not authorize execution. After test
results are reviewed, obtain explicit authorization for one disposable object in
the existing production bucket, the affected deployment's existing principal and
the fixed diagnostic namespace. Do not point the test mode at production. Set
`PROBE_TARGET=production-disposable`, select the intended existing bucket and
matching `PROBE_CONFIRM_BUCKET` via the operator secret environment, then use:

```sh
node --conditions=react-server dist-worker/ops/s3-delete-probe-cli.js --production-disposable --execute --authorize-production-disposable
```

The separate flag/target checks are operator attestations, not automatic discovery
of whether a bucket is production. The CLI still creates only its own UUID key;
it cannot target an existing document. Even a successful production diagnostic
namespace test does not prove policies on a different employment-document prefix.
Inspect effective policy for that prefix privately; do not test by deleting a user
object or broadening credentials. This prepared command does not authorize its use.

### Independent signed-request comparison if still needed

No independent comparison is established by the archived investigation. If a future
same-principal probe returns 403 after policy review, retain the failed
probe's private identity, and obtain authorization for a separate comparison.
Use a second standard SigV4 implementation (for example an approved AWS CLI v2 /
Botocore operator client), not an unsigned DELETE or browser console action.
Configure exactly the same endpoint, region, static principal, TLS validation and
addressing mode. Send only ordinary DeleteObject for that **known disposable probe**,
with no VersionId, conditions, ACL or retention bypass. Suppress normal response
payloads/debug logs and emit only status/allowlisted category. Verify HEAD absence
independently and inspect retained versions. Never paste a signed request into a
report or pass secret values in process arguments.

If both signed clients are denied, seek effective-policy/provider evidence. If one
succeeds, compare canonical method, URI encoding, host/path-style, region/service
scope, query and header **names** privately. A provider-side trace can establish
which request detail caused denial. Different identities, targets or newly changed
policies invalidate the comparison. Do not change application signing from a
single uncontrolled result.
