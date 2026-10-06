# First live Rumpty integration verification — 4 October 2026

Result: **partial connectivity verified; deployment acceptance blocked**. Configuration was loaded from ignored `.env`. No configuration values, credentials, connection strings, signed URLs or model outputs are included in this report. No commit, push, deployment, schema mutation or architecture change occurred. Only synthetic storage/inference content was used.

## Results

| Check | Observed result |
| --- | --- |
| Production preflight | Failed: APP_URL/NEXTAUTH_URL remain matching HTTP localhost origins. Separately, WORKER_REQUIRED is explicitly false, which release acceptance rejects. |
| PostgreSQL | Prisma connectivity failed. Configured hostname is internal and does not resolve from this machine. TLS mode is require. Database state is **unknown**, not assumed empty. |
| Database/migrations | No migrations applied. Could not inspect tables or migration history; no baseline/reset/resolve attempted. Run the documented inspection and migration procedure from the authorized Rumpty network. |
| Redis | Configured internal hostname does not resolve locally; PING failed. URL uses redis rather than rediss; verify the provider's private-network transport guidance instead of changing protocol by guesswork. |
| S3 connectivity | HTTPS endpoint resolved; HeadBucket succeeded. |
| S3 write/read | Private synthetic PutObject succeeded; SDK read and signed GET returned identical bytes. Signed GET returned HTTP 200 with attachment disposition. |
| S3 privacy | Unsigned GET and all-zero tampered signature returned HTTP 403. This verifies the tested object, not every bucket policy. |
| S3 expiry | After the two-second signature lifetime plus 3.5-second wait, GET returned HTTP 500. Bytes were not returned, but this is not the expected 401/403/404 denial; provider expiry behavior needs investigation. |
| S3 deletion | DeleteObject returned AccessDenied/403. Cleanup could not finish, and deletion/revocation behavior is not accepted. See residual object below. |
| AI authentication/model | `/models` without authorization returned 401; configured Bearer credential returned 200 and listed the configured model (one listed model). Credential and model identifier are valid for discovery. |
| AI application classification | Existing synthetic employment-contract classification payload with JSON response format exceeded the application's 25-second deadline. No classification/extraction response was available to validate. |
| AI longer diagnostic | One explicit classification diagnostic with a 60-second timeout also aborted without HTTP response; observed wall time approximately 80 seconds. No timeout change was made to the application. |
| AI minimal extraction | A final one-field synthetic employer extraction with max_tokens=128 also aborted without response (25-second abort signal; approximately 91 seconds observed wall time). JSON/schema/grounding and the six-type extraction suite remain unverified; no further paid attempts were made. |
| Worker | Health lookup unavailable because Redis/PostgreSQL are unreachable. No job dispatched, session cleanup run, scheduling modified or heartbeat fabricated. |
| Health/readiness | Local production standalone runtime, bound to loopback, returned `/api/health` 200 with Treviqo status and `/api/ready` 503 with generic unavailable status. This is not public Rumpty HTTPS ingress verification. |
| Backups/snapshots | Still unverified: no snapshot ID, retention configuration or successful restore evidence available. |

The full production preflight was not bypassed or marked passed. Independent S3/AI connectivity diagnostics used the unchanged adapters with development-mode environment parsing solely because the local HTTP app origin otherwise prevents provider initialization. The real provider endpoints remained HTTPS; certificate verification remained enabled. The local web health smoke explicitly used production mode.

## Synthetic object requiring cleanup

One synthetic object remains because the configured credential cannot delete it:

`deployment-probes/e8c9635a-b2f4-46c8-a135-d87549cbd7db.txt`

Contents are a short deployment-test marker with no personal data. Grant the intended restricted DeleteObject permission and remove this exact key with the existing storage adapter, or delete it through the Rumpty console. Check retained versions/lifecycle separately. Do not broaden to a public bucket or delete unrelated objects. No additional storage objects were created after discovering this failure.

## Configuration and provider blockers

1. Set the real canonical HTTPS APP_URL and identical NEXTAUTH_URL; enable WORKER_REQUIRED for release acceptance. Local development values were not rewritten to invented production values.
2. Execute from Rumpty private-network compute or an authorized tunnel/VPN. Inspect the selected database before migrations. If empty, apply the nine existing migrations with `migrate deploy`; if existing, verify history/backups first. Verify drift afterward. Do not guess a public hostname or port.
3. Fix the scoped S3 delete permission, clean the residual synthetic key, and reverify deletion/revocation. Investigate expired-link HTTP 500 with Rumpty. Inspect bucket policy/public access/version retention in the console.
4. Confirm inference compute/model health, capacity/cold start, gateway timeout and OpenAI-compatible chat-completion support. Model discovery alone does not prove inference. Do not increase production deadlines or change architecture without diagnosed evidence. Rerun the six synthetic classification/extraction cases after the minimal inference probe succeeds; retain strict grounding and explicit user confirmation.
5. Once database/Redis access works, run service checks and a controlled worker acceptance from that network. Verify real public HTTPS health/readiness after deployment. No real-worker data should be added until storage deletion and privacy acceptance pass.
6. Configure and verify encrypted backups/snapshots, retention and isolated restoration before accepting the environment.

## Validation scope

Executed production preflight, redacted configuration/DNS diagnostics, read-only Prisma connectivity, Redis PING/worker-health diagnostics, live synthetic S3 operations, authenticated/unauthenticated AI model discovery, bounded synthetic inference requests and a local production-runtime liveness/readiness smoke. No automated test suite was pointed at live infrastructure. Application code was unchanged; the previous preparation's full suite (214 unit, 81 integration, 49 browser tests) remains historical evidence, not a new live test result.

See [ordered deployment procedure](FIRST_RUMPTY_DEPLOYMENT.md) for release/migration commands. Milestone 8 functionality was not implemented.

Temporary probe scripts and the local loopback production server were removed/stopped after verification. `git diff --check` passed. The residual S3 object remains explicitly outstanding until delete access or console cleanup is available.

## Deployment blocker follow-up

See [private-network execution, S3/AI diagnosis and manual backup fallback](RUMPTY_BLOCKERS.md) for current results and operator steps. Internal PostgreSQL/Redis DNS is expected to require a Rumpty-hosted workload; no public access is needed.
