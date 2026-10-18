# Judge and developer demo

Use [the live application](https://treviqo.rumptycloud.app) or a configured local instance from the [README](../../README.md#local-development). Allow approximately 15–20 minutes for setup and review; inference latency varies. A prepared account makes the presentation shorter, but no shared demo login or automatically seeded account is provided.

Use fictional data only. This guide creates records through the UI, never through database scripts. It does not delete records, change provider permissions or require a production diagnostic probe. Document/account deletion is deliberately outside the demo while direct S3 deletion remains blocked; see [operational status](../deployment/S3_DELETE_AUTHORIZATION_INVESTIGATION.md#current-live-status).

## Prepare the evidence

Use the existing synthetic PDFs below; their adjacent JSON files contain source text and expected fixture values, not live AI predictions. Download repository files to the device used for uploads.

| Evidence          | PDF                                                                                  | Reference text/values                                                                  |
| ----------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Contract          | [employment_contract.pdf](../../tests/fixtures/intelligence/employment_contract.pdf) | [employment_contract.json](../../tests/fixtures/intelligence/employment_contract.json) |
| Payslip           | [payslip.pdf](../../tests/fixtures/intelligence/payslip.pdf)                         | [payslip.json](../../tests/fixtures/intelligence/payslip.json)                         |
| Final settlement  | [final_settlement.pdf](../../tests/fixtures/intelligence/final_settlement.pdf)       | [final_settlement.json](../../tests/fixtures/intelligence/final_settlement.json)       |
| Pension statement | [pension_statement.pdf](../../tests/fixtures/intelligence/pension_statement.pdf)     | [pension_statement.json](../../tests/fixtures/intelligence/pension_statement.json)     |

The examples include October/November 2026 dates. They describe a fictional scenario, including dates after the hackathon demo day; the app allows user-entered future dates without automatic status transitions. Do not present these as actual contributions or payments. Use the older fictional employment below to demonstrate immediately due reminders without changing clocks or database state.

Before presenting, check that registration, uploads and manual review work, and that the worker is running. AI failure should lead to a visible manual fallback, not an invented success. On small phones, Documents/Profile are in **More**; Reminders has its own primary destination.

## 1. Create a personal employment history

Register a fresh fictional worker with first name, last name, a unique synthetic email and a password satisfying the displayed requirements. Successful registration signs the user in. Optional preferred name/country can be edited in Profile; country is profile information, not a jurisdiction-specific legal engine.

From Home, create these records:

| Employer             | Role               | Start      | End        | Status  |
| -------------------- | ------------------ | ---------- | ---------- | ------- |
| Cedar Studio Demo    | Assistant designer | 2024-01-01 | 2025-09-30 | Closed  |
| Harbour Workshop Ltd | Designer           | 2026-10-01 | 2026-10-31 | Exiting |
| Meadow Services Demo | Senior designer    | 2026-11-01 | Unknown    | Active  |

Expected: Home separates current and previous roles. Passport initially includes only Cedar. Names and dates are entered by the worker, not verified with an employer. Harbour exactly matches the fixture's employer spelling, which matters for pension matching.

## 2. Upload and review Harbour evidence

Open Documents → Upload, choose **Harbour Workshop Ltd**, and upload the four PDFs with their corresponding categories. Check the employment association before each upload. Files cannot be reassigned between employments through an edit flow.

Open a document and choose **Extract and review details**. Run extraction once, inspect the proposal beside its source excerpt, and explicitly confirm or correct it. If extraction fails or produces only some fields, use manual entry or fill missing fields from the original PDF. Never enter a value merely to make a check pass.

Review at least:

- Contract: employer, role, start date, salary `NGN 250,000`, notice period `30 days`.
- Payslip: employer, pay period `2026-10`, gross pay `NGN 250,000`, net pay `NGN 215,000`, employee pension deduction `NGN 20,000`.
- Settlement: pay period `2026-10`, final salary `NGN 250,000`, pension deduction `NGN 20,000`, total `NGN 230,000`.
- Pension: provider `Fixture Pensions`, coverage `2026-10` through `2026-11`, entry 1 employer `Harbour Workshop Ltd`, contribution month `2026-10`, posting date `2026-11-05`, employee amount `NGN 20,000`, employer amount `NGN 25,000`.

Normalizing a stated date/amount uses **Save correction**, preserving the original proposal. Do not invent absent values. For the pension statement, inspect the full original before setting the completeness field to Yes. It contains only one contribution entry: leave unused blank contribution slots untouched. Explicitly reviewing a contribution slot as Unknown can keep reconciliation incomplete. If AI proposes extra unsupported rows, demonstrate Needs clarification or start a clean manual attempt and fill only the supported first entry. AI must not set completeness for the user.

Expected: proposals are visibly separate from confirmed/corrected fields; source and correction history remain available. Employment details do not silently change after review.

## 3. Check the exit and leave an action unresolved

Open Exit and start a case for Harbour:

1. Choose Resignation and last working date `2026-10-31`.
2. In Notice, set notice applicable to Yes and notice date `2026-10-01`. Select the reviewed contract's `30 days` field; do not also enter competing manual wording.
3. In Money and pension, select the settlement as the final-pay record, identify October 2026, record pension participation Yes and details saved only if you have reviewed them. Keep reimbursements Pending to demonstrate a follow-up.
4. In Records and benefits, leave unsupplied evidence Unknown; save and view the checklist.

Expected: nine checks mix satisfied and unresolved states. Notice dates should appear consistent with the selected wording. A missing record or pending reimbursement should prompt clarification/action, not an accusation or a calculated debt. Creating the case does not close the employment.

Show that evidence selectors contain only this employment's records. Documents saved under another employment are not eligible, even for the same signed-in user. Exit-type discrepancy warnings, where explicit document evidence conflicts, require review; they do not automatically change the selected exit type.

## 4. Review settlement and pension

From the checklist open **Review settlement and pension**.

Add a Final salary comparison, label it “October salary record check”, choose the reviewed contract salary (or payslip gross pay) as expected evidence and the settlement's Final salary as actual evidence. Identify `2026-10` on both sides.

Expected: the selected `NGN 250,000` amounts and periods are consistent. Explain that this is not proof of payment. To demonstrate a clarification without fabricating evidence, temporarily identify a different actual period such as `2026-09`: the app should flag differing user-identified periods. Correct it back to `2026-10` afterward. Do not compare gross salary to a net total as if those were the same item.

Start pension verification if none exists. Select target period `2026-10`, the reviewed pension statement and optionally the reviewed payslip employee deduction. Save. With the entries, coverage and completeness reviewed, the October employee contribution should be detected and match the selected deduction. Only then use the explicit confirmation action.

Expected: the status distinguishes detection from confirmation by the worker. A November posting date does not change the October contribution period. Rejected, changed or incomplete evidence requires clarification rather than an automatic confirmation. This is not a query to a PFA or a guarantee that all contributions were reconciled.

## 5. View continuity across completed employments

Edit Harbour employment to **Closed**, retaining end date `2026-10-31`, then open Passport.

Expected: Cedar and Harbour appear as separate completed-employment entries; Meadow remains active and is excluded. Harbour's entry links to its original facts and shows exit follow-ups, document availability and reviewed pension status. Cedar can remain sparse/Unknown, demonstrating an honest incomplete history.

Open the benefit categories. All start Unknown unless the worker has assessed them. Explain Portable and Employer-linked, but leave them Unknown when these four PDFs do not establish continuation terms. For a separate evidence-backed benefit demonstration, upload a fictional benefit document under the correct employment and assess only wording it actually supports. A document category or pension provider name alone does not confirm portability or coverage.

Expected: closing the employment does not remove unresolved actions or turn Unknown benefits into confirmed benefits. Passport is a current projection, not an exportable certificate or employer endorsement.

## 6. Return to due reminders

Create an exit case for **Cedar Studio Demo** with Contract completion and last working date `2025-09-30`. Leave notice applicability Unknown, final-pay evidence missing and leave Pending. This deliberately incomplete historical case makes the first action follow-up due immediately under the app's reminder convention.

Allow the continuous worker to reconcile, then open Reminders and refresh. The worker ticks every 10 seconds and finished job sweeps recur after 60 seconds; backlog/outages can delay results. Allow a few minutes rather than expecting an immediate request-time notification.

Open an unresolved action to return to its source. Snooze one prompt for seven days, refresh and confirm it stays hidden. Dismiss another current prompt. Resolve a source answer (for example, set leave to None only within this fictional scenario) and refresh to see that the action is no longer current. A materially changed episode can resurface later.

If no reminders appear, check worker health and due dates; do not modify production jobs or timestamps to force the demo. Explain that in-app follow-up is implemented but availability depends on the worker. There is no email, SMS or push delivery.

## Finish and explain the boundaries

Sign out. Summarize the visible outcome: personal employment history, privately stored originals, explicitly reviewed facts, transparent checks, a cross-employer Passport and actionable follow-ups.

Demonstrate a feature only when it actually succeeds. AI/manual fallback, Unknown states and provider outages are part of the product's honest boundaries. Do not schedule account deletion as a demo reset: it disables access immediately and storage cleanup is currently blocked. Retain fictional demo data until an authorized cleanup can verify object absence.
