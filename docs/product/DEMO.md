# Judge-facing demo and verification guide

Use [the live application](https://treviqo.rumptycloud.app) or a configured local instance from the [README](../../README.md#local-development). Target a **six-minute presentation** using a prepared fictional account. Allow 15–20 minutes or more for rehearsal/setup; inference latency varies. No shared demo login or automatically seeded account is provided. The steps below describe expected behavior, not a claim that this walkthrough was rerun against the live deployment.

Use fictional data only. This guide creates records through the UI, never through database scripts. It does not delete records, change provider permissions or require a production diagnostic probe. Document/account deletion remains outside this continuity-focused demo; see [operational status](../deployment/RUMPTY_DEPLOYMENT.md#current-deployment-and-known-limitation).

## Six-minute live walkthrough

Complete [preparation and rehearsal](#preparation-and-optional-deeper-verification) before presenting. The presentation ends at the closing line below; the remaining sections are presenter notes. Leave one supported field available to review live. Show the real deployed origin, keep credentials and signed download URLs off screen, and use only fictional evidence. If an interaction fails, show its fallback or explain the limitation; do not narrate an expected result as observed success.

Opening: **“Employment changes, but the worker still needs the evidence. Treviqo connects records, reviewed facts and follow-ups across employers.”**

| Time      | Show and do                                                                                                                                                 | What the judge can verify                                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:40 | Open Home on RumptyCloud; show Cedar, Harbour and Meadow.                                                                                                   | **Platform Deployment:** the functional application and one worker's separate employment histories.                                                                                |
| 0:40–1:40 | Open a Harbour document, its original evidence and review screen; confirm/correct one supported field. Use a prepared extraction if live inference is slow. | Rumpty AI proposes facts; the worker reviews them. Manual entry is a fallback, not an AI result.                                                                                   |
| 1:40–2:40 | Show the Exit checklist and a source-linked unresolved action. If the optional redundancy evidence is prepared, show its warning and explicit correction.   | **Practical Utility:** discrepancies lead back to evidence; the app does not decide legal entitlement or silently change the exit type.                                            |
| 2:40–3:40 | Show the selected settlement amounts/periods and pension contribution, then distinguish detected from worker-confirmed.                                     | Matching records are useful checks, not proof of payment or guaranteed pension reconciliation.                                                                                     |
| 3:40–4:40 | Open Passport with Cedar and Harbour closed; show that Meadow remains active and benefits may remain Unknown.                                               | Continuity across completed jobs without mixing employers' evidence or automatically confirming benefits.                                                                          |
| 4:40–5:30 | Open a due reminder, follow its source link and snooze one prompt.                                                                                          | Unresolved work remains actionable after employment ends.                                                                                                                          |
| 5:30–6:00 | Open the [architecture](../architecture/ARCHITECTURE.md#current-implementation) and [testing guide](../testing/TESTING.md).                                 | **Code Quality & Tech Docs:** module boundaries, ownership checks, deterministic rules and reproducible validation commands. Do not imply tests were run during this presentation. |

Close: **“The outcome is a personal continuity record with evidence and next actions—not an employer verdict or a benefit-transfer service.”**

## Preparation and optional deeper verification

The numbered steps are the reproducible setup and longer walkthrough. Complete them before the timed presentation; do not wait for multiple AI calls or worker sweeps on stage. The optional redundancy extension below requires preparing its stated fictional document first.

### Fixture choice and the Zara journey

The requested fictional **Zara Okonkwo → Harborpoint Logistics → Briarwell Consumer Services → Solaris Retail Technologies** journey has no matching fixture pack in this checkout. Its prior operator testing is not independently reproducible from the supplied repository files. Do not relabel the Harbour PDFs as those employers or claim this guide reproduces that prior test.

For now, use Cedar / Harbour / Meadow below. To substitute Zara later, supply a clearly fictional, reviewable pack containing:

- The three employment records' exact roles, dates and statuses, with no real personal identifiers.
- Contracts/payslips for the evidenced employers, with consistent names, currencies and pay periods.
- An explicit redundancy notice for the intended employer, plus the deliberately conflicting saved exit selection and the expected correction.
- Settlement and pension statements with supported line items, coverage, contribution month, separate posting date and employee/employer amounts.
- Benefit or exit evidence for each completed employment whose benefit assessment is demonstrated, plus an unresolved action/date that makes a reminder due.

Include original PDFs and a source-text/expected-review manifest. Check employer association and rehearse the complete journey before claiming it works. These are missing inputs, not new fixture paths or delivered functionality.

### Prepare the evidence

Use the existing synthetic PDFs below; their adjacent JSON files contain source text and expected fixture values, not live AI predictions. Download repository files to the device used for uploads.

| Evidence          | PDF                                                                                  | Reference text/values                                                                  |
| ----------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Contract          | [employment_contract.pdf](../../tests/fixtures/intelligence/employment_contract.pdf) | [employment_contract.json](../../tests/fixtures/intelligence/employment_contract.json) |
| Payslip           | [payslip.pdf](../../tests/fixtures/intelligence/payslip.pdf)                         | [payslip.json](../../tests/fixtures/intelligence/payslip.json)                         |
| Final settlement  | [final_settlement.pdf](../../tests/fixtures/intelligence/final_settlement.pdf)       | [final_settlement.json](../../tests/fixtures/intelligence/final_settlement.json)       |
| Pension statement | [pension_statement.pdf](../../tests/fixtures/intelligence/pension_statement.pdf)     | [pension_statement.json](../../tests/fixtures/intelligence/pension_statement.json)     |

The examples include October/November 2026 dates. They describe a fictional scenario, including dates after the hackathon demo day; the app allows user-entered future dates without automatic status transitions. Do not present these as actual contributions or payments. Use the older fictional employment below to demonstrate immediately due reminders without changing clocks or database state.

Before presenting, check that registration, uploads and manual review work, and that the worker is running. AI failure should lead to a visible manual fallback, not an invented success. On small phones, Documents/Profile are in **More**; Reminders has its own primary destination.

### 1. Create a personal employment history

Register a fresh fictional worker with first name, last name, a unique synthetic email and a password satisfying the displayed requirements. Successful registration signs the user in. Optional preferred name/country can be edited in Profile; country is profile information, not a jurisdiction-specific legal engine.

From Home, create these records:

| Employer             | Role               | Start      | End        | Status  |
| -------------------- | ------------------ | ---------- | ---------- | ------- |
| Cedar Studio Demo    | Assistant designer | 2024-01-01 | 2025-09-30 | Closed  |
| Harbour Workshop Ltd | Designer           | 2026-10-01 | 2026-10-31 | Exiting |
| Meadow Services Demo | Senior designer    | 2026-11-01 | Unknown    | Active  |

Expected: Home separates current and previous roles. Passport initially includes only Cedar. Names and dates are entered by the worker, not verified with an employer. Harbour exactly matches the fixture's employer spelling, which matters for pension matching.

### 2. Upload and review Harbour evidence

Open Documents → Upload, choose **Harbour Workshop Ltd**, and upload the four PDFs with their corresponding categories. Check the employment association before each upload. Files cannot be reassigned between employments through an edit flow.

Open a document and choose **Extract and review details**. Run extraction once, inspect the proposal beside its source excerpt, and explicitly confirm or correct it. If extraction fails or produces only some fields, use manual entry or fill missing fields from the original PDF. Never enter a value merely to make a check pass.

Review at least:

- Contract: employer, role, start date, salary `NGN 250,000`, notice period `30 days`.
- Payslip: employer, pay period `2026-10`, gross pay `NGN 250,000`, net pay `NGN 215,000`, employee pension deduction `NGN 20,000`.
- Settlement: pay period `2026-10`, final salary `NGN 250,000`, pension deduction `NGN 20,000`, total `NGN 230,000`.
- Pension: provider `Fixture Pensions`, coverage `2026-10` through `2026-11`, entry 1 employer `Harbour Workshop Ltd`, contribution month `2026-10`, posting date `2026-11-05`, employee amount `NGN 20,000`, employer amount `NGN 25,000`.

Normalizing a stated date/amount uses **Save correction**, preserving the original proposal. Do not invent absent values. For the pension statement, inspect the full original before setting the completeness field to Yes. It contains only one contribution entry: leave unused blank contribution slots untouched. Explicitly reviewing a contribution slot as Unknown can keep reconciliation incomplete. If AI proposes extra unsupported rows, demonstrate Needs clarification or start a clean manual attempt and fill only the supported first entry. AI must not set completeness for the user.

Expected: proposals are visibly separate from confirmed/corrected fields; source and correction history remain available. Employment details do not silently change after review.

### 3. Check the exit and leave an action unresolved

Open Exit and start a case for Harbour:

1. Choose Resignation and last working date `2026-10-31`.
2. In Notice, set notice applicable to Yes and notice date `2026-10-01`. Select the reviewed contract's `30 days` field; do not also enter competing manual wording.
3. In Money and pension, select the settlement as the final-pay record, identify October 2026, record pension participation Yes and details saved only if you have reviewed them. Keep reimbursements Pending to demonstrate a follow-up.
4. In Records and benefits, leave unsupplied evidence Unknown; save and view the checklist.

Expected: nine checks mix satisfied and unresolved states. Notice dates should appear consistent with the selected wording. A missing record or pending reimbursement should prompt clarification/action, not an accusation or a calculated debt. Creating the case does not close the employment.

Show that evidence selectors contain only this employment's records. Documents saved under another employment are not eligible, even for the same signed-in user. Exit-type discrepancy warnings, where explicit document evidence conflicts, require review; they do not automatically change the selected exit type.

#### Optional redundancy discrepancy demonstration

The existing [termination fixture](../../tests/fixtures/intelligence/termination_letter.json) says “role discontinued.” That wording and a Termination letter category alone **do not establish redundancy**. Do not expect that PDF to trigger the warning. The [browser scenario](../../tests/e2e/passport.spec.ts) exercises an explicit redundancy source separately; its injected text and mock marker are test machinery, not a judge-ready PDF or evidence of live AI accuracy.

To demonstrate the behavior through the UI, first export the following clearly fictional text as a PDF using a local document editor. This is an optional operator-prepared artifact, not a bundled fixture. Upload it only under **Cedar Studio Demo**, as a Termination letter:

```text
SYNTHETIC DEMO ONLY — NOT A REAL EMPLOYMENT RECORD
Cedar Studio Demo
Notice of Role Redundancy
Letter date: 31 August 2025
Reason: Role redundancy following departmental restructuring
Employment end date: 30 September 2025
```

Use the Cedar exit case from step 6, whose initially saved Contract completion is deliberately inconsistent for this demonstration. Extract and review the stated reason (or enter that exact reason manually from the original). Open Cedar's Exit checklist and Passport entry: **Exit type needs review** should link to the source. An evidence-backed proposal can be shown as an **unconfirmed extracted detail**; it must not be presented as a confirmed fact. Review the original, then explicitly edit the exit case to Redundancy and save. The warning should disappear; the saved type remains worker-entered. Harbour's entry must not acquire Cedar's warning.

Do not infer redundancy from “role discontinued,” modify the document's wording during review, or claim a legal conclusion. If this extra PDF has not been prepared/rehearsed, omit the live redundancy segment and identify it as an optional verification, not an observed result.

For developers, the existing focused browser scenario can be run on disposable test services after following the [testing setup](../testing/TESTING.md):

```sh
npm run test:e2e -- tests/e2e/passport.spec.ts -g "exit discrepancy stays informational"
```

This uses local fixtures and mutates test data. It is not a production probe and was not run as part of this documentation refinement.

### 4. Review settlement and pension

From the checklist open **Review settlement and pension**.

Add a Final salary comparison, label it “October salary record check”, choose the reviewed contract salary (or payslip gross pay) as expected evidence and the settlement's Final salary as actual evidence. Identify `2026-10` on both sides.

Expected: the selected `NGN 250,000` amounts and periods are consistent. Explain that this is not proof of payment. To demonstrate a clarification without fabricating evidence, temporarily identify a different actual period such as `2026-09`: the app should flag differing user-identified periods. Correct it back to `2026-10` afterward. Do not compare gross salary to a net total as if those were the same item.

Start pension verification if none exists. Select target period `2026-10`, the reviewed pension statement and optionally the reviewed payslip employee deduction. Save. With the entries, coverage and completeness reviewed, the October employee contribution should be detected and match the selected deduction. Only then use the explicit confirmation action.

Expected: the status distinguishes detection from confirmation by the worker. A November posting date does not change the October contribution period. Rejected, changed or incomplete evidence requires clarification rather than an automatic confirmation. This is not a query to a PFA or a guarantee that all contributions were reconciled.

### 5. View continuity across completed employments

Edit Harbour employment to **Closed**, retaining end date `2026-10-31`, then open Passport.

Expected: Cedar and Harbour appear as separate completed-employment entries; Meadow remains active and is excluded. Harbour's entry links to its original facts and shows exit follow-ups, document availability and reviewed pension status. Cedar can remain sparse/Unknown, demonstrating an honest incomplete history.

Open the benefit categories. All start Unknown unless the worker has assessed them. Explain Portable and Employer-linked, but leave them Unknown when these four PDFs do not establish continuation terms. For a separate evidence-backed benefit demonstration, upload a fictional benefit document under the correct employment and assess only wording it actually supports. A document category or pension provider name alone does not confirm portability or coverage.

Expected: closing the employment does not remove unresolved actions or turn Unknown benefits into confirmed benefits. Passport is a current projection, not an exportable certificate or employer endorsement.

### 6. Return to due reminders

Create an exit case for **Cedar Studio Demo** with Contract completion and last working date `2025-09-30`. Leave notice applicability Unknown, final-pay evidence missing and leave Pending. This deliberately incomplete historical case makes the first action follow-up due immediately under the app's reminder convention.

Allow the continuous worker to reconcile, then open Reminders and refresh. The worker ticks every 10 seconds and finished job sweeps recur after 60 seconds; backlog/outages can delay results. Allow a few minutes rather than expecting an immediate request-time notification.

Open an unresolved action to return to its source. Snooze one prompt for seven days, refresh and confirm it stays hidden. Dismiss another current prompt. Resolve a source answer (for example, set leave to None only within this fictional scenario) and refresh to see that the action is no longer current. A materially changed episode can resurface later.

See [current production evidence](../deployment/RUMPTY_DEPLOYMENT.md#current-deployment-and-known-limitation) for reminder observations and the unverified complete sweep. Passing worker health does not prove a finished sweep. If no reminders appear, check worker health, strict job diagnostics and due dates; do not modify production jobs or timestamps to force the demo. Explain that in-app follow-up is implemented but availability depends on the worker. There is no email, SMS or push delivery.

### Finish and explain the boundaries

Sign out. Summarize the visible outcome: personal employment history, privately stored originals, explicitly reviewed facts, transparent checks, a cross-employer Passport and actionable follow-ups.

Demonstrate a feature only when it actually succeeds. AI/manual fallback, Unknown states and provider outages are part of the product's honest boundaries. Do not schedule account deletion as a demo reset: it disables access immediately and cleanup is asynchronous, subject to verified object absence. Retain fictional demo data until an authorized cleanup can verify object absence.
