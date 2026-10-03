# Treviqo UI/UX Rules

## Feel
Calm, trustworthy, modern, personal, simple, mobile-native.

Do not make Treviqo look like enterprise HR software.

## Mobile first
Design and validate smartphone layouts first.

## Bottom navigation
1. Home
2. Exit
3. Passport
4. Documents
5. Profile

Desktop can use a sidebar with the same information architecture.

## Home
Show:
- current employment
- active exit
- next action
- outstanding items
- recent documents

Avoid analytics-heavy dashboards.

## Exit flow
Use steps:
1. exit type
2. dates
3. money/items to review
4. benefits
5. documents
6. readiness result

Support save-and-return.

## Checklist
Each item shows:
- title
- state
- explanation
- evidence/source
- next action

States:
- Complete
- Pending
- Missing
- Needs clarification
- Not applicable

Do not rely on color alone.

## Documents
Use mobile-friendly cards/rows, clear progress, processing state, and extraction review.

## Extraction review
Show:
- field
- proposed value
- source snippet where available
- confidence/review indicator
- edit/confirm controls

## Passport
Use a personal career/benefit timeline.
Mask sensitive identifiers by default.

## Copy
Prefer:
- Needs clarification
- Confirm with your employer
- Not identified in uploaded documents
- Waiting for verification
- Review this item
- Complete

Avoid loaded legal language.

## Interactions
Prefer:
- bottom sheets
- step flows
- cards
- expandable details
- sticky mobile actions

Avoid dense grids and desktop-only patterns.

## Accessibility
- semantic HTML
- keyboard support
- labels
- visible focus
- sufficient contrast
- touch-friendly targets
- error association
- no color-only meaning

## States
Every core feature needs:
- empty
- loading
- processing
- error
- success

## Future native app
Do not create web flows that depend on desktop conventions.

## Milestone 1 implementation

Home is the entry point for employment records. The first-use card explains the three essential fields and links to creation. Current and previous roles use cards with explicit text statuses and view actions. Detail screens lead to editing; create/edit screens have native date controls, optional type/end-date fields, 48px controls, save/cancel actions, and field-associated errors. Failed saves preserve entered values and allow retry. Successful saves show confirmation on the detail screen.

The five primary destinations remain unchanged. Home stays selected while viewing/editing employment. Exit, Passport, and Documents remain labelled placeholders. The Home exit section says “No active exit process”; employment status alone does not imply an exit case. Desktop expands the same cards rather than switching to dense tables.

## Milestone 2 implementation

Documents is now functional: employment filter, document cards, upload form/progress, detail, short-lived download action, and explicit deletion confirmation. Empty states guide users to create employment or upload; failures preserve selection for retry. Pending/failed/deleting states remain visible for recovery. Nested document pages keep Documents selected in the five-section navigation. Screens were tested at 320/375/430px; Exit and Passport remain placeholders. No AI controls are shown.
