---
name: treviqo-security
description: Use for auth, authorization, uploads, object storage, signed URLs, secrets, audit logging, deletion, privacy, and security reviews.
---

# Treviqo Security

Read `/docs/security/SECURITY.md` and `/AGENTS.md`.

Requirements:
- private storage by default
- server-side ownership checks
- time-limited signed document access
- filename/MIME/size validation
- secrets only in environment configuration
- no sensitive document contents in logs
- authorization tests proving users cannot access each other's records
