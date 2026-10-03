# Treviqo AI Document Processing

## Principle
Rumpty AI performs narrow document-understanding tasks.
It is not the legal or business decision-maker.

## Initial types
- employment contract
- payslip
- resignation letter
- termination letter
- exit letter
- pension statement
- final-settlement document
- reimbursement/expense evidence
- benefit document
- other

## Pipeline
```text
Upload
 -> validate
 -> private storage
 -> prepare readable content
 -> classify
 -> type-specific extraction
 -> validate schema
 -> store proposed extraction
 -> user review/correction/confirmation
```

## Prompt rules
- one narrow purpose
- strict JSON
- explicit schema
- return null when absent
- no unsupported inference
- no broad legal interpretation
- short prompts where possible
- grounded only in supplied content

## Contract fields
- employer
- employee if present
- role
- start date
- employment type
- salary amount/frequency
- notice period
- annual leave
- probation
- pension references
- HMO references
- group-life references
- relevant exit-clause snippets

## Payslip fields
- employer
- employee
- pay period
- gross/net pay
- basic salary
- pension deduction
- tax
- other deductions
- explicit reimbursements/allowances

## Resignation fields
- letter date
- notice date
- proposed last day
- stated notice period
- reason if explicit

## Termination fields
- letter date
- effective date
- stated reason
- notice/pay-in-lieu wording
- settlement references
- benefit termination references

Never classify lawfulness.

## Pension statement fields
- PFA/provider
- safe identifier where appropriate
- statement period
- contributions
- contribution dates
- employer names
- employee/employer contribution values where distinguishable

## Final settlement fields
- pay period
- final salary
- leave settlement
- reimbursement
- bonus/commission
- pension deduction
- loan deductions
- other deductions
- total settlement

## Confidence
Use:
- high
- medium
- low
- needs_review

## User confirmation
Allow:
- confirm
- edit
- reject
- mark unknown

Store original proposed value plus confirmed/corrected value.

## Fixtures
Create synthetic fixtures for contracts, payslips, resignation letters, pension statements, and final settlements.
Automated tests should not repeatedly consume live inference credits.

## Versioning
Record model, prompt/schema version, and extraction timestamp.
