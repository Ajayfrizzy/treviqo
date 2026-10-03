---
name: treviqo-rumpty
description: Use for deployment, PostgreSQL, Redis, S3 storage, AI inference, workers, backups, GitHub integration, and Rumpty Cloud infrastructure.
---

# Treviqo Rumpty Cloud

Read `/docs/deployment/RUMPTY_DEPLOYMENT.md`, `/docs/architecture/ARCHITECTURE.md`, and `/AGENTS.md`.

Use Rumpty Cloud wherever it provides the required equivalent infrastructure service.

Expected services:
- app/compute
- PostgreSQL
- Redis
- private S3-compatible storage
- AI inference
- worker compute
- snapshots/backups
- deployment/monitoring

Do not store important state on ephemeral disks and never commit infrastructure credentials.

Before final deployment, verify HTTPS, migrations, private document access, Redis jobs, AI connectivity, mobile critical path, backups, and docs.
