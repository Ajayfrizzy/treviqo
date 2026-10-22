# Direct S3 DELETE investigation — 18 October 2026

> Archived on 22 October 2026. Findings, failures, test counts and outstanding checks below describe the original dated investigation, not current production status. See [current operational evidence](../../deployment/RUMPTY_DEPLOYMENT.md#current-deployment-and-known-limitation). Archiving does not certify every earlier acceptance check or residual probe cleanup.

## Current live status

**Normal API deletion remains unresolved.** Direct DeleteObject returned HTTP 403 AccessDenied with RumptyCloud S3 credentials in both the production investigation and one controlled dedicated private-test-bucket run. RumptyCloud support has been contacted, as reported by the project operator. The exact cause—missing allow, explicit policy/condition, retention or provider API behavior—is not established. No credential rotation, broader access or adapter workaround is justified by the 403 alone.

The authorized private test used only `PROBE_*` credentials and a disposable generated object after local checks confirmed separate production/test identifiers, matching test confirmation and no conflicting definitions/environment overrides. No production operation was performed in that run. Public documentation intentionally omits storage identifiers, probe keys/run IDs and incident-specific user details.

| Controlled private-test operation                | Actual result      | Interpretation                                          |
| ------------------------------------------------ | ------------------ | ------------------------------------------------------- |
| PutObject                                        | 200                | Private test object stored                              |
| GetObject                                        | 200; bytes matched | Read and content verification passed                    |
| HeadObject before DELETE                         | 200                | Object existed                                          |
| HeadObject for never-written key                 | 404 NotFound       | Absence verified for that test key/principal            |
| DeleteObject                                     | 403 AccessDenied   | Authorization failure; normal deletion did not succeed  |
| HeadObject after DELETE and final cleanup        | 200                | Object remained accessible; cleanup failed              |
| GetBucketVersioning / GetObjectLockConfiguration | 403 AccessDenied   | Actual versioning/lock configuration unknown            |
| GetObjectRetention / GetObjectLegalHold          | 400 InvalidRequest | Inconclusive; not proof that retention/holds are absent |
| ListObjectVersions                               | 403 AccessDenied   | Retained-version inventory unverified                   |

The disposable test object remained at the end of the run and requires authorized operator follow-up using the private diagnostic record. No later cleanup is claimed. Do not create repeated probes while cleanup is blocked. A test-bucket result does not prove production-bucket or document-prefix permissions, and a missing-key 404 in this test does not establish production HEAD behavior.

**Verified manual-removal recovery is implemented:** pending document metadata can finalize on an authorized retry only after the adapter verifies absence under the correct bucket/versioning mode. HTTP 403 is never proof of deletion. Scheduled account cleanup likewise retains disabled accounts, unpurged keys and retry/checkpoint state until verification succeeds. See [recovery steps](../../deployment/DOCUMENT_DELETION_RECOVERY.md) and [account lifecycle](../../security/ACCOUNT_DELETION.md).

Recommended next action: RumptyCloud support/operator review of the effective DeleteObject policy and provider-side request handling for the affected principals/targets, plus confirmation of bucket versioning/retention. Keep object ownership and access restrictions intact. An independent signed-client comparison or a new production disposable probe needs separate explicit authorization; neither has been performed as part of the controlled test.

## Original audit and probe preparation

The sections below record the initial audit before the subsequently authorized private-test run. Use the current status above for live results; the request audit and guarded operator procedures remain applicable.

## Conclusion and evidence boundary

**The exact production root cause is not established.** The recorded live evidence
from 4 October proves that the configured application principal received
DeleteObject **403 / AccessDenied / authorization** while read/write operations
worked. It does not distinguish a missing allow from an explicit deny, prefix
condition, retention restriction, or a provider gateway mapping an error to 403.
Console deletion may run under a different principal/API and does not demonstrate
application DELETE authorization.

No live S3 requests were made during the initial audit/preparation phase. A designated private test
bucket and scoped probe configuration were not supplied. Existing application
credentials are not implicitly designated test credentials. Production mutations
were explicitly excluded. No current production document, bucket key, credential,
connection URL or signed request is reproduced here.

Sources: [original live report](LIVE_RUMPTY_VERIFICATION.md),
[follow-up DELETE/HEAD evidence](../../deployment/RUMPTY_BLOCKERS.md#s3-deletion-diagnosis), and
[verified recovery behavior](../../deployment/DOCUMENT_DELETION_RECOVERY.md).

| Operation                               | Historical live evidence          | HTTP / safe category                           | New evidence / limitation                                                                              |
| --------------------------------------- | --------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| HeadBucket                              | Succeeded                         | Exact status not recorded / none               | Connectivity does not establish DELETE policy                                                          |
| PutObject, private ACL                  | Succeeded                         | Exact status not recorded / none               | Real-SDK local fixture succeeds; no new live PUT                                                       |
| GetObject                               | Identical bytes returned          | Signed GET 200 / none; SDK status not recorded | Real-SDK local fixture verifies bytes                                                                  |
| HeadObject, existing object             | Succeeded in follow-up            | 200 / none                                     | Real-SDK local fixture returns 200                                                                     |
| DeleteObject                            | Denied twice, including follow-up | 403 / authorization, code AccessDenied         | Ordinary configured SDK DELETE succeeds against local fixture (204); current Rumpty success unverified |
| HeadObject, missing object              | Not established live              | Unknown                                        | Local fixtures exercise 404 / not_found and 403 / authorization; 403 never establishes absence         |
| GetBucketVersioning                     | Denied in follow-up               | 403 / authorization                            | Actual production mode remains unknown                                                                 |
| GetObjectLockConfiguration              | Denied in follow-up               | 403 / authorization                            | Actual production lock/default-retention state remains unknown                                         |
| GetObjectRetention / GetObjectLegalHold | No recorded live test             | Unknown                                        | New probe supports read-only checks on its own disposable object                                       |
| ListObjectVersions                      | No recorded live test             | Unknown                                        | New probe restricts inventory to its own generated key                                                 |
| Unsigned/tampered GET                   | Denied                            | 403 / authorization                            | Historical privacy evidence for that object only                                                       |

## Application audit

`src/server/storage/client.ts` constructs the same SDK client for all operations:
explicit endpoint, region, access key ID and secret; `forcePathStyle` defaults true;
`maxAttempts: 1`. There is no default credential-chain fallback, custom signer,
manual Authorization header, DELETE-specific endpoint or alternative provider.
The SDK signs with SigV4. TLS validation is not disabled. No explicit region
redirect option is enabled. The application supports a static credential pair,
not temporary session-token credentials; no evidence says temporary credentials
were used in the failing request.

`src/server/config/env.ts` requires the complete S3 environment group and HTTPS
in production. Local `.env` structural inspection (values withheld) found a complete
group, HTTPS, no endpoint path/query/userinfo, path-style true/default,
unversioned/default, and no session token. **This is not deployed configuration
verification.** The adapter does not discover bucket versioning automatically.

| Operation            | Application input                                                  | Relevant S3 permission distinction                                                              |
| -------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| PUT                  | Bucket, Key, bytes, ContentType, private CacheControl, ACL=private | PutObject, and provider-equivalent ACL authorization where required; never implies DeleteObject |
| HEAD                 | Bucket, Key                                                        | GetObject; missing-key 404 visibility may require applicable ListBucket                         |
| GET                  | Bucket, Key                                                        | GetObject; signed downloads also set response disposition/type/cache headers                    |
| Ordinary DELETE      | **Bucket, Key only**                                               | DeleteObject on intended object resource/prefix                                                 |
| Exact-version DELETE | Bucket, Key, VersionId                                             | DeleteObjectVersion; retention/MFA constraints may additionally apply                           |
| Version inventory    | Bucket, Prefix=exact generated key, MaxKeys=100                    | ListBucketVersions on the bucket with applicable prefix conditions                              |

There are no application DELETE ACLs, If-Match/If-None-Match, MFA, expected-owner,
request-payer, object-lock, or bypass-governance options. VersionId is supplied only
in explicitly configured versioned cleanup. New real-SDK wire regression coverage
confirms DELETE method/path, SigV4 region/service scope, empty body, no version or
conditional query, and absence of those optional headers. The SDK may add normal
protocol headers and `x-id` operation metadata; no evidence demonstrates a Rumpty
incompatibility with these. The local fixture checks request construction; it does
not cryptographically validate signatures or emulate Rumpty authorization.

PUT and DELETE use independent clients with identical configuration. Successful
PUT/GET is evidence that some signing/endpoint/credential use works, but cannot
exclude method-specific policy, prefix or gateway handling. There is no reason to
change ACLs, signing, region, addressing, headers or SDK version speculatively.

### Deployment, retry and finalization

The web and worker are separate Docker runtime targets/processes, both importing
the same storage adapter. S3 settings are runtime environment values, not hardcoded
Docker arguments. `.env*` is excluded from Docker context. Rumpty must inject
matching intended endpoint, region, bucket, path-style/versioning mode and correctly
scoped credentials into **each** deployment. Code does not compare their environments
or ensure they use the same principal. Secret names being identical is not evidence
of identical deployed values or effective policy. Readiness/HeadBucket is not a
DELETE permission check.

Single-document removal remains owner-authorized and goes through `purge`:
unversioned HEAD → DELETE → HEAD; versioned cleanup inventories/deletes exact
versions and markers then verifies inventory and HEAD. A delete marker may hide
bytes while retained versions remain. Named NoSuchBucket, authorization failures,
contradictory NotFound/403 and unexpected failures never finalize deletion.
Status/audit/extraction cleanup commits only after verified purge. The lower-level
`remove` is used for upload compensation and does not establish verified erasure;
the durable reservation/key is retained for recovery.

There are no SDK automatic retries. The worker only cleans due scheduled accounts,
checkpoints at most three objects per pass, and uses per-account backoff from
10 seconds to 30 minutes. Job leases and Redis queue repair remain unchanged.
A single active user's pending document does not authorize background account
cleanup. Repeated 403s cannot be fixed by retries; they require evidence/policy
investigation. Logs distinguish delete_object from verify_object_absence and redact
provider messages, keys, credentials and URLs.

The older `deployment:check --storage` probe first performs signing/expiry checks;
an expiry 500 can stop it before its ordinary DELETE stage, followed by cleanup
DELETE in `finally`. It also accepts a signed GET 403 as access denial, which is
**not proof of absence**. Use the dedicated probe below for diagnosis; do not infer
physical deletion from that old acceptance check. No application deletion logic
was changed in this investigation.

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

**Operator-only command: the controlled run above used this test authorization path. Do not rerun without fresh authorization and a cleanup plan:**

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

Prepared, **not authorized for execution by this task and not run**. After test
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

Not performed. The controlled private-test run now reproduces the denial, but no separately authorized second-signer comparison has been run. If the
same-principal probe still returns 403 after policy review, retain the failed
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

## Discriminating causes and exact operator actions

| Candidate                       | Evidence needed                                                                                                              | Minimal action only if established                                                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong credential/configuration  | Rumpty principal identity and deployed web/worker target comparison; method-specific request trace                           | Correct the misconfigured deployment's reference/setting through an authorized release; no credential rotation justified yet                                                                                                     |
| Missing DeleteObject allow      | Effective policy evaluation denies DeleteObject on intended object resource with no overriding deny                          | Grant that application principal `s3:DeleteObject` equivalent only for intended private objects/prefix                                                                                                                           |
| Bucket/prefix/condition deny    | Inspect identity + bucket/resource policies, conditions and explicit denies for the failed request                           | Correct only the unintended restriction; an Allow cannot override explicit Deny                                                                                                                                                  |
| HEAD missing-key ambiguity      | Same principal returns 403 for generated never-written key                                                                   | Check applicable `s3:GetObject` and `s3:ListBucket` visibility/prefix semantics with Rumpty; never translate 403 to deletion success                                                                                             |
| Versioning                      | Verified Enabled/Suspended state and returned version/delete-marker metadata                                                 | Use the deployment's correct existing cleanup mode and scoped ListBucketVersions/DeleteObjectVersion equivalents; do not switch mode to evade retention                                                                          |
| Retention/legal hold/MFA Delete | Authorized bucket/object metadata and provider policy trace                                                                  | Follow retention policy/provider guidance; no bypass or hold removal. Object Lock may block permanent version deletion while ordinary marker creation still succeeds, so enabled lock alone does not explain ordinary DELETE 403 |
| Unsupported options             | Provider error/trace identifies a particular emitted SDK option                                                              | Implement a narrowly tested adapter correction only for the demonstrated incompatibility; none established here                                                                                                                  |
| Signature/region/path-style     | SignatureDoesNotMatch, InvalidAccessKeyId, AuthorizationHeaderMalformed, region hints or canonical-request trace             | Correct only the demonstrated setting/signature issue; generic AccessDenied is insufficient evidence                                                                                                                             |
| Provider API/gateway defect     | Correct effective permission, matched signed-client reproduction, provider trace identifying method routing/parser rejection | Ask Rumpty support to correct gateway/API behavior; supply timestamps, safe operation/status/code and private provider-side correlation, never credentials or signed requests                                                    |

No evidence currently justifies credential changes, policy broadening or an
application DELETE modification. The initial recommendation was a controlled test-bucket probe; that has now reproduced the denial. Have the Rumpty operator inspect the production principal's
effective DeleteObject authorization and compare web/worker runtime settings.
If necessary, authorize the separate production disposable probe afterward.

## Validation

All checks below passed: **500 unit tests, 55 focused integration tests, lint,
TypeScript, production build and worker build**. Commands run locally:

- `npm test` — 500 tests passed, including real-SDK ordinary DELETE wire shape and
  safe probe gating, redaction, denied deletion/verification, retained versions,
  foreign inventory rejection and ambiguous-PUT cleanup.
- `npm run test:integration -- tests/deletion-recovery.integration.test.ts tests/documents.integration.test.ts tests/account-deletion.integration.test.ts tests/jobs.integration.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run worker:build`

Integration uses disposable local PostgreSQL 17 / Redis 7 and synthetic storage,
with all 12 migrations applied only to the fresh test database. These tests cannot
establish Rumpty's live policy or cryptographic signature acceptance. During that initial validation phase, no live comparison was performed. The later
authorized private-test result is recorded above; no new production-bucket,
independent-signer or deployed web/worker comparison is claimed. No production data/configuration changed; no commit, push or deployment.
