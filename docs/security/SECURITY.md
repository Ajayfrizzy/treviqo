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

- Password hashing uses the established `argon2` library: Argon2id, 64 MiB memory, three iterations, one lane, library-generated random salt. Passwords are 15–128 characters, never trimmed or truncated. Benchmark the parameters on Rumpty compute before launch. Passwords/hashes must never be logged.
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
