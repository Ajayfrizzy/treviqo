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

## Milestone 3 review

Ready documents link to a dedicated mobile review page. The empty state offers AI extraction or manual entry; an optional transcription disclosure handles images/scans. Each field has its original proposal, exact source excerpt where available, textual confidence/review state, editable value, and explicit confirm/correct/reject/unknown actions. Null proposals cannot be confirmed. Failed saves preserve typed corrections for retry. Loading/status messages announce progress; refresh and earlier-attempt selection support interrupted requests. Low-confidence classifications invite an explicit type choice. No legal/readiness decisions appear.

## Milestone 4 Exit flow

Exit is now functional. Select employment, then use four phone-first steps: Exit details; Notice; Money and pension; Records and benefits. Exit type and planned/actual last working date are required; other answers default to unknown. Save and view checklist is available from every step once the required details are valid, allowing save-and-return. Back/Next and Cancel are explicit; failed saves preserve input. Unsaved navigation/reload does not persist drafts.

Nine cards show labelled states, the basis for each check, and a next action. Source links lead to the existing secure document/review pages. Complete is explained as a limited record/answer check, never a legal or payment verdict. The five-section bottom navigation remains unchanged with Exit selected throughout nested pages. Home now links to saved exit checklists without changing employment status.

## Milestone 5 settlement and pension review

The Exit checklist links to a phone-first settlement/pension page. Cards show comparison state in text, expected/actual amounts, periods, source-review links, explanation and next action. Native month/date inputs, category-filtered reviewed fields, save/edit/cancel/remove controls, and retained input on failure support review on phones. Refresh rechecks evidence. Pension matching has a separate explicit confirmation button; it never silently marks a match confirmed.

Empty, saving, error/retry and saved states are visible. The five-section navigation remains; no dense financial table is introduced. Follow-up dates explicitly say no automated reminder is sent. Completeness and three-entry statement limits are explained before confirmation. Browser coverage checks 320/375/430px overflow and source changes after confirmation.

## Milestone 6 Passport

Passport now has a semantic closed-employment timeline and detail cards for original employment period, exit follow-up state, pension provider/contribution status, benefit assessments and key document availability. Current/active jobs remain managed from Home. Unknown dates remain explicit; original records are corrected at their existing screens.

Worker-entered facts, confirmed/corrected fields, worker assessments, and unresolved information have distinct text labels. Benefit category alone never produces a portability claim. Assessment forms require supporting evidence/acknowledgment for non-unknown choices and offer save/cancel/remove plus retained input on failure. Refresh rechecks sources; unavailable reopened entries clear from view. Nested pages retain Passport navigation. No tables, download certificates or employer verification controls are introduced.

## Milestone 7 implementation

Milestone 7 adds Home → View reminders with mobile cards, source links, seven-day snooze and dismissal. Home stays selected in the existing five-section bottom navigation. Loading, empty, successful action, retry/error and delayed-worker states are explicit. Current evidence is rechecked on refresh; no email/push delivery or statutory deadline claims are shown.

## Production polish — 7 October 2026

The desktop shell uses a 232px sidebar (252px above 1100px), with a persistent brand, consistent outlined icons, and a filled active destination. Below 800px it collapses to the original five-area bottom navigation. Content is fluid up to 1200px, with one-column forms capped at 760px and auth at 520px. Desktop expands cards; it does not introduce tables. Page headings use a restrained 1.85–2.5rem scale. Cards, section spacing, status pills, secondary actions, and 48px form controls share styling. Mobile inputs use 16px text; focus, disabled, read-only, validation, date and select states remain visible. Motion respects reduced-motion preferences.

Registration shows a live, text-labelled checklist: 8–128 characters, uppercase A–Z, lowercase a–z, number 0–9, and a non-letter/non-number/non-whitespace special character. Spaces are preserved but do not count as special characters. A shared module validates both client and server. Existing passwords remain usable at sign-in; complexity is a creation requirement. Both screens include password reveal, password-manager autocomplete, field-associated validation with focus on the first invalid field, explicit busy states, and retry feedback. Registration has one sign-in link; successful creation replaces the form with a clear next action.

Profile reads only the authenticated account’s email. It explains password protection, the lack of email verification, the maximum eight-hour session, and the scope of sign-out. It does not expose hashes, session identifiers, or claim an exact expiry based on NextAuth’s rolling public expiry value. No database fields or public session fields were added.

Route skeletons retain the shell and identify the section being loaded. Upload distinguishes byte transfer from storage completion, with indeterminate progress during finalization. Interrupted documents explain refresh/remove/retry. Extraction distinguishes processing, loading, manual preparation, and review saving; manual fallback remains available. API actions bound their UI wait (30 seconds normally, 120 seconds for extraction), preserve inputs on failure, and advise checking current records before retrying an uncertain mutation. They do not automatically retry. NextAuth continues to own sign-in and CSRF retrieval. Existing error boundaries provide explicit retry actions.

Home, Exit, Passport and Documents first-use copy explains the purpose, value, and next action. The Passport still depends on explicitly closed employment; no domain behavior has changed. See [polish report](../milestones/UI_UX_POLISH.md) for validation and remaining checks.

## Interaction refinement — 7 October 2026

Save/Cancel pairs use equal grid columns with a shared green background and white text. Cancel has a lighter inset border and lighter text weight. Both controls remain present while saving; Cancel is disabled until the result is known. Narrow-screen padding keeps labels wrapping at word boundaries. Upload, Exit and benefit/settlement editing use the same action grouping. Review, refresh and card-following actions have explicit spacing.

A shared Button shows a local spinner and blocks repeat clicks while its async handler runs. Forms expose their existing busy state, and synchronous actions have a pressed treatment. Document filtering and error retries use transitions. Links show pending feedback through Next.js useLinkStatus without adding artificial delays. Loading panels combine the destination label, a spinner, explanatory copy, progress track and skeletons; motion respects reduced-motion preferences.

The document review no longer displays model, prompt or schema metadata. Plain-language provenance, original-document links, evidence excerpts, confidence/review states and correction history remain available. Technical metadata stays in the existing extraction record; domain rules and API contracts are unchanged.

See the [interaction refinement report](../milestones/UI_INTERACTION_REFINEMENT.md) for test results and manual-check limits.

## Seven-day account deletion

The earlier immediate-deletion copy is superseded. Profile explains immediate
account disabling, seven-day scheduling, all-session logout and password-verified
cancellation before the displayed deadline. It requires current password and DELETE.
Confirmation shows the actual scheduled date/time in West Africa Time. A valid
pending-account sign-in shows the restricted deletion screen, with cancel and leave
scheduled actions; cancellation asks for credentials again. After the deadline,
only processing/disabled information is shown. Unknown email and wrong password
share identical copy; infrastructure errors have distinct temporary-unavailable copy.
