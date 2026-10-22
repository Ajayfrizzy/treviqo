# Documentation guide

Treviqo (treh-VEE-koh) is live at [treviqo.rumptycloud.app](https://treviqo.rumptycloud.app). Start at the [main README](../README.md) for setup and the implemented product journey.

## For judges and product reviewers

- [Product overview](product/PRODUCT.md): audience, problem, implemented capabilities and explicit non-goals.
- [Six-minute walkthrough](product/DEMO.md#six-minute-live-walkthrough): presentation route mapped to the three judging criteria.
- [Demo preparation and deeper verification](product/DEMO.md#preparation-and-optional-deeper-verification): repository-backed fictional journey, manual fallback and optional redundancy evidence; the Zara fixture pack is not bundled.
- [Milestone map](milestones/MILESTONES.md): delivery history and links to dated implementation reports.
- Additional historical reports: [navigation performance](archive/milestones/NAVIGATION_PERFORMANCE.md) and [scheduled account deletion](archive/milestones/SCHEDULED_ACCOUNT_DELETION.md). These preserve implementation evidence, not current deployment certification.

## For developers

- [Architecture](architecture/ARCHITECTURE.md): modular monolith, module map, data boundaries and four worker jobs.
- [Domain rules](domain/DOMAIN_RULES.md): employment, exit, settlement, pension and benefit decisions.
- [AI documents](ai/AI_DOCUMENTS.md): supported categories, proposal grounding, review and recovery.
- [Security](security/SECURITY.md): authentication, authorization, private documents and privacy limits.
- [Account deletion](security/ACCOUNT_DELETION.md): scheduling, cancellation, verified storage cleanup and retries.
- [UI/UX](ui/UI_UX.md): responsive navigation, forms, feedback and review context.
- [Testing](testing/TESTING.md): unit, integration, browser and deployment checks with disposable services.

## For operators

- [Rumpty deployment](deployment/RUMPTY_DEPLOYMENT.md): runtime configuration, worker, health and restore procedures.
- [Release acceptance](deployment/FIRST_RUMPTY_DEPLOYMENT.md): ordered build, migration and controlled acceptance steps.
- [Current production evidence](deployment/RUMPTY_DEPLOYMENT.md#current-deployment-and-known-limitation): dated operator observations and remaining verification.
- [Guarded S3 probe](deployment/S3_DELETE_PROBE.md): separately authorized disposable-object diagnosis; never a routine health check.
- [Document deletion recovery](deployment/DOCUMENT_DELETION_RECOVERY.md): finalize pending metadata only after verifiable absence.
- [Network and backup recovery](deployment/RUMPTY_BLOCKERS.md): active private-network and backup/restore procedures, with explicitly dated incident evidence.
- [Archive inventory](archive/README.md): historical milestones, live verification and AI/S3 investigations; these are not current deployment instructions.

## How to interpret historical reports

Current summaries at the top of the architecture, AI, deployment, security and UI guides take precedence over dated milestone details below them. Milestone reports preserve what was implemented/tested at that time, including older paths, test counts and earlier limitations. They are not instructions to redeploy old revisions or claims of current production acceptance.

The live app URL is the project's supplied deployment address. This documentation pass does not certify uptime, every deployed revision, backup restoration, model accuracy or provider permissions. On 22 October 2026 the operator reported passing web health/readiness and worker health, corrected missing production `DATABASE_URL`, two successful direct document deletions and reminders responding to employment changes. A complete successful reminder sweep has not been independently verified. Earlier S3 and worker failures remain historical evidence, not current unresolved deployment blockers. Never publish environment values, internal storage identifiers, signed URLs or user evidence with a report.

## Documentation ownership and overlap

The root README owns the entry point, setup commands and judging map; this index owns navigation. PRODUCT explains the implemented scope, while DEMO owns presentation and rehearsal steps. Keep detailed rules in the domain/AI/security guides and link to them rather than copying their full procedures into the demo.

The deployment runbook owns current configuration and operations. Release acceptance describes the ordered release checks; the live reports and milestone records preserve dated evidence. The deployment guide owns current production evidence; the S3 investigation preserves historical findings and the active probe guide owns guarded diagnostic steps. Document/account deletion guides explain distinct recovery lifecycles. Their shared summaries provide context and are not interchangeable copies.

No documentation files are deleted. Seventeen dated reports are moved into the [archive](archive/README.md), with their contents and original validation history retained apart from navigation/status banners. No disposable duplicate or obsolete file was established. Being old or absent from the main README is not evidence that a report, fixture or source file is unused. Keep uncertain local notes for operator review rather than deleting them automatically.
