# Rumpty extraction diagnosis — 7 October 2026

Status: application hardening and local fallback validation complete; **live extraction acceptance remains blocked**. No commit, push, deployment, live database mutation or user-document access occurred. Only repository synthetic fixtures were sent to inference. No credentials or raw provider responses were logged.

## The production 503 boundary

The reported production `/api/documents/:id/extractions` HTTP 503 cannot be attributed exactly from the available production evidence. The supplied `.env` identifies localhost as APP_URL; no production URL, authenticated reproduction, ingress log or server exception was available. A request for the production URL/redacted failure details remains outstanding. The live tests below are direct Rumpty inference tests, not a reproduction of the hosted application's 503.

Code tracing and the standalone production smoke establish:

- POST authenticates, applies the shared Redis write limiter, initializes the service, verifies document ownership, applies the extraction limiter, and reserves an attempt in PostgreSQL.
- It prepares private PDF text (or labelled user transcription), then classifies unless the worker explicitly selected a type. Other/low-confidence classification pauses type-specific extraction.
- An inference HTTP 503, timeout or rejected output is caught by the service, persisted as a failed attempt, and normally returned as **HTTP 200 with `extraction.status=failed`**. Manual entry stays available. This behavior predates this change and has now been verified through the production build.
- An application HTTP 503 means an exception escaped that boundary: authentication infrastructure, Redis, database/service initialization, attempt reservation, failure persistence, result read or review. An ingress-generated 503 may never reach this route. A provider error alone does not establish which occurred.

New content-free diagnostics identify `extraction_request_failed` stages (authentication, read/write limiter, service initialization, read, start, review), `extraction_start_failed` stages (document lookup, extraction limiter, reservation, preparation, classification/extraction, result/failure persistence, result read), and validated Prisma codes. For example, P2021/P2022 would identify missing table/column migrations; they are **not claimed observed in production**. `extraction_inference_failed` records only stage, fixed failure category and numeric provider HTTP status. `extraction_output_invalid` separates classification from extraction parsing failures. No document/user IDs, source text, provider messages, SQL metadata, keys or URLs are included.

To finish the production diagnosis, obtain the failing response content type/body and timestamp, deployed revision, and corresponding existing server/ingress logs. A JSON application error and an HTML/proxy 503 require different investigations. After an explicitly authorized deployment of these diagnostics, the fixed stage labels can locate any previously opaque exception; no deployment was performed here.

## Endpoint, model and request compatibility

The configured endpoint is `https://chat.rumptycloud.com/v1/chat/completions`, model `llama3.2:3b`, Bearer authentication, JSON messages with system/user roles, `stream:false`, temperature zero. Plain inference and application classification returned HTTP 200. The strict-schema diagnostic also reported the configured model identifier. No different endpoint, model or infrastructure provider was substituted. Public `/openapi.json` returned 404, so it supplied no protocol documentation.

Compatibility is partial:

- `response_format: {type: "json_object"}` did not reliably enforce JSON. A minimal user-only request returned non-JSON despite HTTP 200 / finish_reason `stop`.
- An explicit JSON-only system instruction made that minimal structured request succeed. Application prompts already contain a system instruction; this alone does not fix document extraction.
- One request for `max_tokens:64` reported 191 completion tokens. Treat the output-token setting as advisory until Rumpty explains this behavior; the application retains an independent 64 KiB byte limit.
- One targeted `json_schema`/`strict:true` test returned HTTP 200 and `stop`, but violated the supplied schema. HTTP acceptance does not prove constrained decoding. The application therefore keeps its existing json_object transport and validates locally.
- Responses require a choices/message/content string and finish_reason `stop`. Malformed envelopes, length truncation, fenced/non-JSON answers, extra properties, unsupported fields and missing evidence are not repaired into trusted facts.

## Controlled live results

The five-stage progression used 14 inference calls total, including targeted diagnostics/prompt revisions after failures. No automatic retries or six-document acceptance sweep ran. One sparse-schema probe had a missing validator import; that probe result was discarded, the script was fixed, and the stage was rerun. Each request had a 25-second deadline. The initial sandbox network failure did not produce provider evidence.

| Stage / diagnostic | Observed result |
| --- | --- |
| Minimal plain request | HTTP 200, exact OK, 2,138 ms |
| Minimal structured request, user-only | HTTP 200, validation failed, 2,270 ms; targeted diagnostic confirmed invalid JSON / `stop`, 191 tokens for requested 64 |
| Minimal structured request, explicit system instruction | HTTP 200, valid exact JSON, 6 completion tokens |
| Existing application classification | Correct grounded employment_contract, high confidence, 2,516 ms |
| Existing full contract extraction | Aborted at 25,011 ms; no accepted response |
| Intermediate shared-cell/null schema | Minimal fixture returned within 9,173 ms but failed validation; another diagnostic produced a complete valid shape, without establishing accuracy |
| Intermediate schema, realistic payslip | Valid shape at 12,342 ms; only **3/11** expected values survived exact grounding |
| Final sparse schema, minimal contract | HTTP 200 at 4,039 ms; schema rejected; **no accepted extraction** |
| Final sparse schema, realistic payslip | HTTP 200 at 7,178 ms; all 11 returned entries omitted evidence; **no accepted extraction** |
| Strict JSON Schema diagnostic, minimal contract | HTTP 200 at 2,342 ms, configured model, `stop`; schema rejected |

These are individual controlled observations, not statistical accuracy estimates. The final candidate cannot be described as reliable live extraction. Missing evidence is intentionally rejected rather than fabricated from matching values. User documents and larger sources were not tested. Six-type live acceptance remains pending provider reliability.

## Final prompt/schema and failure-handling changes

`evidence-v3` / `fields-v3` asks for a sparse `fields` array containing only `{key,value,evidence}` for present, unambiguous facts. One shared item schema replaces repeated per-field schemas: contract JSON Schema text shrinks from 5,537 to 642 characters. Field labels retain semantic guidance. There is no architecture change, extra inference stage, automatic repair call or provider fallback.

The server enforces the type's allowed keys, string lengths, maximum field count, unique keys and exact source/value grounding. It expands absent fields into the complete existing review model with null values. Every new sparse proposal has `needs_review` confidence and remains Proposed with trusted value null. Legacy complete field-object responses remain strictly validated for compatibility. Pension completeness remains forcibly null, and pension rows retain their original restrictions. Classification retains its strict evidence/confidence schema. A user-selected type still skips classification.

Classification now requests 256 output tokens; extraction requests 2,048 instead of 4,096 for every call. The 25-second deadline covers headers and body consumption; no deadline increase was used to conceal failures. At most two inference calls occur per automatic attempt, one for explicitly selected types. PDF preparation remains bounded to 10 seconds, the processing lease remains two minutes, and the browser request budget remains 120 seconds. These application budgets do not establish Rumpty ingress timeouts; those still need production measurements.

Typed errors distinguish timeout, transport, provider HTTP status, oversized, malformed and incomplete envelopes. Timeout attempts now provide specific existing-layout manual-entry guidance. Invalid model output remains a failed attempt with no partial accepted fields. Manual entry bypasses AI and storage; the user chooses a type and explicitly corrects fields. Earlier attempts/reviews remain intact. Retry is a worker action, rate limited, with no hidden paid retries. Authentication, ownership, private storage and fail-closed Redis/database behavior are unchanged.

## Validation

- `npm run validate`: lint, TypeScript, **249 unit tests**, Next production build and worker build passed.
- `DATABASE_URL=<disposable loopback database> REDIS_URL=<disposable loopback cache> npm run test:integration -- tests/extractions.integration.test.ts`: **12 passed**. Tests cover sparse persistence, missing-field expansion, timeout -> manual entry, ownership, prior reviews, locking and stale updates.
- `DATABASE_URL=... REDIS_URL=... npm run test:e2e -- tests/e2e/extractions.spec.ts`: **8 passed**, including 320/375/430/768/1440px review layouts, unavailable/malformed/low-confidence cases, manual entry, authorization, explicit retry and repeat-click protection.
- `DATABASE_URL=postgresql://treviqo_test@127.0.0.1:25432/treviqo_test node tests/extraction-production-smoke.mjs`: passed against `.next/standalone/server.js` with NODE_ENV=production, synthetic HTTPS application origin and locally trusted TLS AI/S3 fixtures. Verified real auth, PDF subprocess, classification/extraction HTTP transport, proposed-only persistence, explicit confirmation, provider HTTP 503 -> failed-attempt HTTP 200, malformed-response fallback, manual entry, preserved prior reviews and private deletion.
- `node --check scripts/rumpty-ai-stages.mjs` and `git diff --check`: passed.

During development, sparse missing-field expansion briefly returned null cells after tightening the legacy schema; unit/integration tests caught it. Expansion was corrected to full null review cells and validation rerun successfully. Next's `next start` standalone warning was resolved for the smoke by running the actual standalone entry point. Local smoke does not verify Rumpty ingress, provider accuracy or worker readiness; WORKER_REQUIRED=false was scoped to that isolated extraction smoke, not production acceptance.

The fixture server now exercises sparse wire responses. `tests/fixtures/intelligence/realistic_payslip.json` contains 11 independently expected explicit facts. The staged operator script uses the actual application adapter for classification/extraction, bounds probe responses, reports only safe metrics, validates every expected fixture value, and stops after failed prerequisites. Run after `npm run worker:build`:

```sh
node --env-file=.env --conditions=react-server scripts/rumpty-ai-stages.mjs
```

An explicit stage argument can resume a diagnosed stage (`structured`, `classification`, `minimal_extraction`, `realistic_extraction`); it is not an automatic retry. Run the full progression only after provider-side improvements. Do not interpret a 200 or JSON parse success as accuracy acceptance.

## Remaining blockers

1. Exact hosted `/extractions` 503 cause: production response/log/revision/ingress evidence is still needed.
2. Rumpty must clarify enforcement/support for json_object/json_schema, output-token limits and reliable evidence-bearing responses on llama3.2:3b. No model switch is justified solely by a successful discovery response.
3. Reliable live minimal and realistic extraction remain unverified with the final schema. Current fail-closed manual fallback is the usable path when inference fails.
4. Production rollout and subsequent hosted smoke are deliberately not performed without explicit instruction.

## Changed files

- `src/server/ai/client.ts`: bounded task-specific token requests and safe typed transport errors.
- `src/modules/extractions/prompts.ts`, `schema.ts`, `service.ts`, `shared.ts`, `http.ts`, `diagnostics.ts`: compact proposals, strict parsing, timeout guidance and content-free stage diagnostics.
- `scripts/rumpty-ai-stages.mjs`: five ordered synthetic probes and safe coverage/shape reporting.
- `tests/ai-client.test.ts`, `extraction.test.ts`, `extraction-http.test.ts`, `extractions.integration.test.ts`: transport deadlines, schema/grounding, 503 boundaries, persistence and fallback regressions.
- `tests/fixtures/ai-server.mjs`, `tests/fixtures/intelligence/realistic_payslip.json`, `tests/extraction-production-smoke.mjs`: sparse HTTP fixture, controlled accuracy source and standalone production smoke.
- `docs/ai/AI_DOCUMENTS.md` and this report: current protocol and observed limitations.

Disposable test containers and local smoke servers were stopped/removed after validation. No product layout, navigation or visual styling changed.
