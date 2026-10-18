# Documentation guide

Treviqo (treh-VEE-koh) is live at [treviqo.rumptycloud.app](https://treviqo.rumptycloud.app). Start at the [main README](../README.md) for setup and the implemented product journey.

## For judges and product reviewers

- [Product overview](product/PRODUCT.md): audience, problem, implemented capabilities and explicit non-goals.
- [Reproducible demo](product/DEMO.md): fictional multi-employment journey using repository PDF fixtures, with manual fallback and expected results.
- [Milestone map](milestones/MILESTONES.md): delivery history and links to dated implementation reports.

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
- [Direct S3 DELETE investigation](deployment/S3_DELETE_AUTHORIZATION_INVESTIGATION.md#current-live-status): current production/test-bucket authorization blocker, safe results and operator probes.
- [Document deletion recovery](deployment/DOCUMENT_DELETION_RECOVERY.md): finalize pending metadata only after verifiable absence.
- [AI extraction diagnosis](deployment/AI_EXTRACTION_DIAGNOSIS.md): model-output and persistence investigations; current protocol is in the AI guide.
- [First live verification](deployment/LIVE_RUMPTY_VERIFICATION.md) and [blocker follow-up](deployment/RUMPTY_BLOCKERS.md): historical October 4 evidence, not current deployment status.

## How to interpret historical reports

Current summaries at the top of the architecture, AI, deployment, security and UI guides take precedence over dated milestone details below them. Milestone reports preserve what was implemented/tested at that time, including older paths, test counts and earlier limitations. They are not instructions to redeploy old revisions or claims of current production acceptance.

The live app URL is the project's supplied deployment address. This documentation pass does not certify uptime, every deployed revision, backup restoration, model accuracy or provider permissions. The unresolved DELETE issue and support escalation remain explicit operational limitations. Never publish environment values, internal storage identifiers, signed URLs or user evidence with a report.
