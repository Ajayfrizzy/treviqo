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
- Statuses may be corrected in either direction. Changing an employment status does not create an exit case, declare exit completion/readiness, trigger pension/reminder work, or generate a Passport.
