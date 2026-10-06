# Treviqo Domain Rules

## Checklist states
- complete
- pending
- missing
- needs_clarification
- not_applicable

Every non-complete item must include an explanation.

## Evidence states
- proposed
- confirmed
- corrected
- rejected

Confirmed/corrected values are trusted.

## Notice-period check
Inputs:
- notice requirement
- notice date
- final working date

Output should describe consistency, not legal validity.

Example:
> Your submitted dates appear consistent with the 30-day notice period stated in your contract.

## Final salary
Track whether a final payslip/settlement exists and whether the relevant pay period is identifiable.

If absent:
> Final salary was not identified in the uploaded settlement documents. Confirm the final-pay breakdown with your employer.

## Reimbursements
If a confirmed reimbursement exists but cannot be identified in final settlement:
> An approved reimbursement of ₦X was not identified in the uploaded final-settlement document. Confirm this with your employer.

## Unused leave
Do not assume unused leave must always be paid.
Flag only when records indicate an unresolved item.

## Company assets
Track:
- returned
- return scheduled
- acknowledgement saved

## Pension exit verification
When employment closes and pension is enabled:
1. create a pending final-contribution verification
2. schedule follow-up
3. accept updated statement
4. extract contributions
5. compare employer/date where possible
6. ask user to confirm

States:
- waiting
- contribution_detected
- contribution_not_detected
- needs_clarification
- confirmed

## Benefit portability
Values:
- portable
- employer_linked
- unknown

Never assume portability without evidence.

## Benefit Passport
May include:
- employer
- role
- period
- document status
- pension provider/status
- benefits
- exit status

Sensitive identifiers should be masked.

## Suggested rule output
```json
{
  "ruleId": "notice_period_consistency",
  "state": "complete",
  "title": "Notice period",
  "message": "Your submitted dates appear consistent with the 30-day notice period stated in your contract.",
  "evidenceRefs": [],
  "requiresUserAction": false
}
```

## Milestone 1 employment facts

- Employer name and role/title are trimmed, nonblank, and limited to 160 characters. Start date is required.
- Inputs use valid Gregorian calendar dates in `YYYY-MM-DD` form, years 0001–9999, stored as PostgreSQL `DATE`; no time-zone conversion changes a day.
- End date and employment type can be unknown (`null`). An end date must be on or after start date; a same-day job is valid.
- Active has no end date. Exiting can record a planned end date. Closed can record an actual end date or leave it unknown. The UI labels these distinctions.
- Active and Exiting group under Current employment; Closed groups under Previous employment. Sort by latest start date first. Multiple current records are valid.
- Future dates are permitted as worker-entered facts; there is no automatic status transition, deadline logic, or legal interpretation.
- Statuses may be corrected in either direction. At Milestone 1, changing employment status does not create an exit case, declare readiness, trigger pension/reminder work, or generate a Passport; Milestone 5 adds the narrow pension follow-up hook described below.

## Milestone 4 implemented rules (`exit-checker-v1`)

The checklist is a pure function of validated worker answers and currently accessible evidence. It has no AI call, external legal lookup, current-clock dependency, monetary calculation, or automatic state override. Every item includes state, explanation, next action, and links/labels identifying the document, reviewed field, or worker answer used. Complete describes the stated record/answer check only; it is not independent verification or an overall readiness verdict.

| Rule | Implemented behavior |
| --- | --- |
| Notice | Worker states applicability. Unknown → Needs clarification; explicit no → Not applicable. Missing wording/date → Missing. Selected field changed/unconfirmed/deleted → Needs clarification. Simple numeric calendar duration compares dates; earlier-than-comparison or ambiguous wording → Needs clarification; date at/after comparison → Complete. |
| Final salary records | No selected current record → Missing; wrong category or no worker-identified pay period → Needs clarification; selected payslip/final-settlement record plus period → Complete for record availability only. No amounts or period coverage verified. |
| Unused leave | Unknown → Needs clarification; none → Not applicable; unresolved → Pending; worker-reported clarified arrangements → Complete. No entitlement to payout assumed. |
| Reimbursements | Unknown → Needs clarification; none → Not applicable; outstanding without selected claim/approval evidence → Missing; outstanding with evidence → Pending; worker-reported clarified → Complete. No settlement comparison. |
| Pension records | Unknown participation → Needs clarification; no participation → Not applicable; participation without confirmation of saved provider/contact details → Missing; details reported saved → Complete for preparation only. No contribution verification. |
| Company assets | Unknown → Needs clarification; none → Not applicable; held/scheduled → Pending; returned without selected acknowledgement → Missing; returned with acknowledgement → Complete based on selection and worker report. |
| Exit documents | No current selected exit evidence → Missing; selected evidence → Complete for availability only. Next action names the chosen exit type; contract completion points to end-date/completion evidence. |
| Reference/employment evidence | Unknown → Needs clarification; not needed → Not applicable; wanted/requested → Pending; reported saved but no current selected file → Missing; selected saved evidence → Complete. |
| Employer-linked benefits | Unknown → Needs clarification; none → Not applicable; unresolved end dates/contacts → Pending; worker-reported clarified → Complete. No portability/coverage classification. |

Notice calculation is intentionally narrow: exact numeric days (optionally “calendar”), weeks, or months only. Days exclude the communication day; weeks are seven calendar days; months add calendar months and clamp to the last valid day (31 January + one month becomes 28/29 February). These are explicit comparison conventions, not statutory counting rules. Maximum supported durations are 730 days or 24 months. Working/business days, spelled-out numbers, alternatives, pay-in-lieu, conditional/probation clauses, and other wording require clarification; the UI asks workers to keep original wording rather than simplify it. Zero-day periods are supported. Leap days/year boundaries are tested.

The last working date is required and cannot precede the employment start at save time. A subsequently changed employment start, or communication date after the final working date, yields Needs clarification. Exit type never determines notice applicability or entitlement. Proposed/high-confidence AI values are not eligible: only an explicitly selected confirmed/corrected contract notice field and its saved review version can supply notice wording. Changed/rejected/deleted evidence is not silently replaced with a newer field or a manual fallback.

Milestone 4 scope boundary: the earlier settlement, pension, benefits, and Passport sections describe later milestones. Milestone 4 does not implement their comparison/verification/reminder workflows.

## Milestone 5 implemented finance rules

`finance-v1` compares explicit currency amounts using integer minor units, selected reviewed field versions, and worker-identified matching periods. Consistent, Not identified, and Needs clarification are finance comparison results, distinct from the nine Exit Checker checklist states. No payment, entitlement, aggregate total, proration or legal conclusion follows from a match. Duplicate field selections, changed evidence, ambiguous values, and mismatches require clarification.

Pension matching requires explicit participation, complete reviewed statement coverage/entries, normalized employer equality and contribution month equality. Posting date is separate and can be later. Optional reviewed payslip employee deductions require a matching reviewed pay month and compare only with the employee component. Multiple/partial rows, zero combined amounts and ambiguous evidence need clarification. Detected contributions require explicit worker confirmation, invalidated by changed evidence/context.

Closing pension-enabled employment now creates one waiting verification when an exit exists; enabling pension on an existing closed employment also initializes it. A changeable follow-up date defaults to end/last-working date plus 30 calendar days, a planning convention only. No background reminder is scheduled. [Full rules and limits](../milestones/SETTLEMENT_PENSION.md).

## Milestone 6 Passport and benefits (`passport-v1`)

Only closed employment appears. Original dates remain worker-entered; unknown end dates are not replaced by exit dates. Closed status does not imply that exit checklist actions are complete. Existing Exit Checker and pension verification states are reused, not recalculated by AI or inferred from a timestamp.

All six benefit categories default to Unknown. Portable and Employer-linked are explicitly labelled worker assessments, requiring current same-employment evidence and acknowledgment. Reviewed mentions/provider names do not prove participation, portability, coverage or transfer. Missing/rejected/revised/deleted evidence, changed metadata, or changed employment/exit context invalidates an assessment to Unknown; the prior choice remains clearly historical until re-reviewed. One current assessment per category provides basic history across employment entries, not a policy ledger.

Pension provider is a current confirmed/corrected field, restricted to the finance-selected statement attempt when one exists. Conflicting available provider values stay unresolved. Participation, provider, portability and contribution verification are separate facts. No reminder automation or legal/employer verification conclusion is introduced.

## Milestone 7 implementation

Milestone 7 derives in-app exit-action, missing-document, pension follow-up and seven-day stale-action prompts from current deterministic checks. Snooze lasts seven days; dismissal applies to the current evidence fingerprint. Completion resolves an action; changed evidence can resurface it. Follow-up dates are planning conventions, not legal deadlines. See [rules and boundaries](../milestones/REMINDERS_RELIABILITY_SECURITY.md#reminder-behavior).
