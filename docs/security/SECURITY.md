# Treviqo Security Requirements

Treviqo stores sensitive employment and benefit documents.

## Core rules
- private storage
- least privilege
- ownership checks
- no public documents
- secure transport
- validated inputs
- auditable sensitive actions

## Authentication
Use production-appropriate auth.
Require secure sessions and rate limiting where appropriate.
Do not invent custom cryptography.

## Authorization
Server-side checks for:
- employments
- documents
- extractions
- exit cases
- benefits
- passport
- reminders

## Object storage
- private bucket
- unpredictable keys
- sanitized filenames
- MIME/file-size validation
- signed/time-limited access
- ownership check before URL signing

## Sensitive data
Do not intentionally store:
- plaintext passwords (salted Argon2id hashes are permitted for application-managed authentication)
- authentication PINs
- bank login details
- security questions
- OTPs

Mask sensitive identifiers.

## Logging
Do not log full document contents, passwords, tokens, or unnecessary identifiers.

Audit examples:
- upload/delete
- extraction confirmed
- employment closed
- passport generated
- export generated

## AI privacy
Send only necessary content to inference.
Record purpose/model/prompt version/timestamp.

## Deletion
Delete object and derived extraction where feasible.
Do not claim deletion if dependent copies remain.

## Rate limiting
Consider for:
- auth
- uploads
- AI extraction
- signed URLs
- expensive processing endpoints

## Secrets
Use Rumpty environment/secret configuration.
Never commit credentials.
Provide `.env.example` with placeholders.

## Backups
Use Rumpty snapshots/backups where available and document restore strategy.

## Foundation authentication security review

Application-managed credentials authentication runs with Treviqo on Rumpty Cloud, backed by Treviqo PostgreSQL. No managed identity provider is assumed.

- Password hashing uses the established `argon2` library: Argon2id, 64 MiB memory, three iterations, one lane, library-generated random salt. New passwords follow the 8–128-character policy below and are never trimmed or truncated. Benchmark the parameters on Rumpty compute before launch. Passwords/hashes must never be logged.
- Email is trimmed and lowercased before validation and persistence. PostgreSQL's unique index enforces duplicate rejection, including concurrent creates. Registration rejects duplicates with generic copy, but different success/failure statuses can still reveal whether an address is registered. Login uses identical generic errors for invalid credentials and nonexistent accounts; absent accounts perform dummy Argon2 verification. This reduces timing differences but is not a guarantee of constant response time.
- Registration selects only `id`; its API returns only `success`. Login selects the hash only inside the server-only auth module, returning only `id`. Public session and `/api/me` responses whitelist fields and cannot serialize hashes, passwords, or session IDs.
- NextAuth handles credentials CSRF validation and encrypted HttpOnly/SameSite=Lax cookies. Production requires HTTPS and Secure cookies. POST auth routes also validate exact Origin. Registration requires same-origin JSON. Both routes enforce an actual streamed 4 KiB body limit. Configure ingress body/time/concurrency limits as well.
- Redis is confirmed available on Rumpty (8.1). The existing global 300 requests/minute auth circuit-breaker remains. Registration and login additionally share 10 attempts per normalized email per 15 minutes, including successes; keys use standard HMAC-SHA256 so emails are not stored in Redis keys. Counters expire and failures are not cleared by successful authentication. Limiter outages fail closed. Add per-client ingress limits before public deployment; arbitrary forwarded headers are not trusted by the app. Account throttling can temporarily deny a targeted account access.
- Encrypted JWT cookies reference PostgreSQL `AuthSession` rows with an absolute eight-hour lifetime. All protected-page/API session checks verify row existence, ownership, and expiry; client expiry alone never authorizes a request. Existing legacy cookies without a session ID are rejected. Logout removes the row and clears the browser cookie, invalidating copied cookies. If deletion fails, the auth route returns 503 without clearing cookies and the UI offers retry. A request already authorized before logout can finish.
- `SESSION_SECRET` is environment-only and must be generated with sufficient entropy. Rotation invalidates every cookie. Session row IDs are not accepted as standalone bearer credentials or returned to browser JavaScript. Expired rows no longer authorize requests; schedule periodic database cleanup using `DELETE FROM "AuthSession" WHERE "expiresAt" < NOW()` through an operator-controlled maintenance job.
- Protected layouts do not replace API authorization. Future record APIs must separately authenticate and check ownership. No document access or upload endpoints are introduced by this correction.
- Email verification, password-reset email, recovery, MFA, password changes, session management UI, and social login are deferred. The entered email is an unverified login identifier and must not be treated as proof of mailbox ownership or used for automatic provider linking.
- Configure auth/registration log redaction at ingress and monitoring: never capture request bodies, password hashes, or Cookie/Set-Cookie values. Errors in application code expose generic messages only.

The credentials change explicitly permits secure password hashes; the project's prohibition on storing passwords means plaintext passwords and third-party banking/identity credentials remain forbidden.

## Employment authorization

Employment list, detail, creation, and edit endpoints independently validate the server session. The service requires a user ID from that session and includes it in every database read/write; ownership is not accepted from input. The strict schema rejects any `userId`, `id`, timestamp, or other unknown payload fields. Foreign and missing records return the same 404. Pages authenticate before data fetches instead of relying only on the layout.

Mutation routes require same-origin JSON and a streamed 4 KiB request limit using the existing auth request helpers. Record responses use `private, no-store`, select no user relation/credentials, and exclude owner IDs. Errors reveal field guidance or generic service-unavailable copy, never database errors or entered content. No new personal-data logging, public records, document access, or deletion behavior was added. Unit, PostgreSQL integration, and browser tests cover cross-worker isolation and tampered ownership payloads.

## Document vault security

Every document API and page authenticates independently. Reads, signing, deletion, and upload employment selection are owner-scoped; foreign and missing IDs return identical 404s. Mutations require exact Origin. Responses disable caching. Uploads enforce actual streamed byte limits even when Content-Length is absent or false, bounded filenames, extension/MIME/signature agreement, and random server-controlled keys. PDF/JPEG/PNG only; these lightweight structural checks are not full parsing or malware scanning.

Objects are written with private ACL and no-store metadata. Access requires Ready status, a database row lock, and a committed audit before returning a 60-second signed GET. Downloads use attachment disposition and sanitized names. Treat URLs as bearer secrets: redact query strings in provider/ingress logs; never log request bodies, cookies, or document contents. Access audit records link issuance, not proof of download. Existing links can be used until expiry or object removal, and downloaded copies cannot be revoked.

Deletion blocks new signing before removing the current object. Deleted rows retain metadata and audit references; account/employment hard deletion is restricted while documents reference them. This is not a complete personal-data erasure feature. Bucket versions, replicas, backups, and user-downloaded copies need separate retention rules. Configure ingress request/concurrency/rate limits before public use; per-user vault quotas and antivirus are not implemented.

## AI extraction and review security

Extraction APIs/pages authenticate and verify explicit document/employment ownership independently. Reads and mutations fail for foreign/deleting/deleted documents. POST/PATCH require exact Origin and bounded JSON bodies; strict schemas reject owner/model/key injection. User input cannot choose a provider URL, prompt, model, or storage path. Field writes are scoped through owned Ready attempts and use optimistic versions; audit failures roll back reviews.

Only readable source text goes to configured Rumpty inference, never public storage URLs or authentication secrets. Source documents are untrusted model input: narrow fixed prompts, no tools, strict output schemas, and evidence-substring checks reduce unsupported output but do not guarantee correctness or defeat every prompt injection. All results remain untrusted proposals until owner review. React renders excerpts as text, never raw HTML. Do not log source/prompt/response bodies; redact provider Authorization headers. Full text is transient; excerpts and correction history are sensitive data and share document access controls.

AI requests have bounded size/time and no redirects; Redis throttles starts to 10 per worker per 10 minutes. PDF parsing runs in a separate process with time/heap bounds and without application secrets in its environment. This is resource containment, not an OS security sandbox or antivirus. Configure host/container memory and ingress concurrency controls. Existing authorized inference may finish after deletion/logout, but deleted documents cannot receive persisted results. Deletion purges extraction content and revisions; database backups and Rumpty provider retention require separate controls.

## Exit-case authorization

Every Exit page and API checks the current session and ownership independently. All case queries/writes include user ownership; the composite employment-owner foreign key prevents inconsistent case ownership. Evidence selection checks both user and employment, so another employment owned by the same worker cannot accidentally supply this case's evidence. Foreign and missing cases return the same 404. Client schemas reject IDs/owners/state injection; updates cannot change employment.

Mutations require exact Origin, JSON, and an actual streamed 8 KiB limit. Responses use private/no-store and select no auth credentials or owner IDs. Optimistic versions prevent stale-tab overwrites; audit failure rolls back the write. Content-free exit_created/exit_updated events identify user, employment, case, and timestamp. No entered answers or excerpts are logged.

Persisted source IDs never authorize access. Each checklist read revalidates Ready documents and Confirmed/Corrected contract fields, including the selected field version. Deleting/Deleted files and revoked/changed reviews cannot continue satisfying a rule on the next read. Already-rendered browser content remains until refresh. Existing stale references can remain during unrelated edits, but new evidence choices must pass ownership checks. Case answers are explicit user data, not AI decisions.

## Milestone 5 finance boundaries

Finance reads/writes constrain exit, employment and evidence ownership. Composite database relations prevent cross-owner finance records; same-owner evidence from another employment is also rejected. Strict JSON commands prohibit ownership reassignment, enforce an 8 KiB body bound, same Origin, session authentication, and private/no-store responses. Serializability, exit locks and optimistic versions prevent lost updates. Audits commit atomically without financial values.

Comparisons bind reviewed field versions. Pension confirmation checks a server-generated current-evidence hash; rejected/deleted/revised fields or changed employment/exit context invalidate it. Rejected contribution entries cannot establish absence, including manually entered entries without AI proposals. No derived financial values are copied into finance rows. Stale opaque source IDs remain to explain invalidated evidence; original documents and extraction data follow existing deletion policy. No public storage or external pension integration is added.

## Milestone 6 Passport boundaries

List/detail/mutations independently require owner authentication and currently closed employment. Source evidence must belong to the same worker and employment; composite ownership keys enforce Benefit persistence. POST requires same-origin JSON, 4 KiB maximum and strict schemas; stale version/context writes fail. Benefit save/removal audits commit with the mutation and contain IDs/actions only.

Minimal DTOs exclude original filenames, snippets, proposals, financial amounts and identifier fields. Generic type/date source labels link to existing authorized document routes. Display names receive server-side masking of common identifier sequences, labelled IDs and emails, with no reveal control; this is defensive pattern masking, not universal redaction. Raw source documents remain sensitive in the vault. Passport APIs use private/no-store and no-referrer; reopened employment is no longer an accessible entry.

## Milestone 7 implementation

Milestone 7 adds per-user Redis limits to uploads, signed links, writes and expensive API reads, failing closed on Redis errors. Employment and reminder transitions have atomic content-free audits. Reminder reads/commands revalidate ownership and current evidence. Queue payloads hold fixed job IDs only; worker logs use generic errors. Expired-session cleanup does not replace request-time expiry enforcement. Ingress must still protect server-rendered reads, request concurrency and aggregate abuse. See [review and operational limits](../milestones/REMINDERS_RELIABILITY_SECURITY.md#security-review-and-fixes).

## October 2026 UI password policy

New accounts require 8–128 characters including uppercase A–Z, lowercase a–z, a digit 0–9, and a non-letter/non-number/non-whitespace special character. Client and server import `src/modules/auth/validation.ts`; passwords are never trimmed or truncated. Sign-in uses its shared presence/maximum-length schema to preserve existing passphrase accounts. Argon2id parameters, dummy hashing, revocation, CSRF, encrypted cookies, ownership and throttling remain unchanged. Profile selects only the authenticated owner's email server-side; public session/API serialization remains unchanged.

## Profile account deletion

Profile now provides password re-authentication plus typed DELETE confirmation. The owner-only, same-origin API persists deletion intent, blocks new uploads, and requires verified cleanup of every owned object/version before a Serializable child-first transaction revokes all sessions and removes all account records, with User last. Storage AccessDenied leaves a clearly reported incomplete deletion and durable keys/checkpoints for retry. Successful responses clear NextAuth cookies and return to sign-in. Passwords, object keys and provider errors are never logged. Provider backups/retained AI copies and downloaded copies are explicitly outside active-system cleanup. See [deletion order, concurrency, failure recovery and Rumpty requirements](ACCOUNT_DELETION.md). Earlier document-vault notes describe document-only deletion, not this account flow.
