## 1. Verdict

Ghosted is a credible shipped product with a distinctive, mostly disciplined interface and unusually careful engineering for a solo build.  
Its weakest layer is not visual polish; it is the **meaning of its states**.  
“Updated,” “ghosted,” milestone progress and board position can disagree about what happened.  
Until those rules agree, further refinement of the cards will have diminishing returns.

## 2. What is genuinely good

- **The product has a clear boundary.** The landing page says what the logbook does *and* what it refuses to do. “No notifications,” “No email scanning,” and “No auto-applying” are useful expectation-setting, not filler. The hero and product preview make the proposition understandable before the feature grid. Evidence: `components/Landing.tsx`; `01-landing-light-1280.jpg`.
- **The two views serve different reading tasks.** Pipeline order on the board and importance order in the list are a defensible distinction. Keeping status counts in column/section headings instead of repeating them in a stat-card row gives the work itself the first screen. Evidence: `lib/utils/status.ts`, `components/Dashboard.tsx`; `05-board-light-1280.jpg`, `08-list-light-1280.jpg`.
- **The status system looks coherent in both themes.** The restrained OKLCH card surfaces, stronger badges and segmented progress bars give dense boards a scannable rhythm without making every card equally loud. The dark board is a designed counterpart, not an inverted light screenshot. Evidence: `lib/utils/card-styles.ts`; `05-board-light-1280.jpg`, `07-board-dark-1280.jpg`.
- **Important alternatives to drag exist.** `MoveToMenu` gives touch and keyboard users a real status action; the card link and menu are siblings, so the action does not accidentally navigate. The mobile board also visibly exposes the next column. Evidence: `components/MoveToMenu.tsx`, `components/KanbanCard.tsx`; `11-board-light-390.jpg`.
- **The code has useful boundaries and regression coverage.** Route handlers are thin; transactional milestone rules sit in the service; the list payload is deliberately smaller than the detail payload. Board/list equivalence, cross-user isolation, mobile overflow and both-theme axe tests target failures this product could actually suffer. Evidence: `lib/services/applications.ts`, `components/use-application-section.ts`; test inventory.

## 3. Findings

1. **Editing notes can falsely revive a ghosted application.** `EditApplicationModal.snapshot()` always includes `status`, even when the user changes only a contact or note. `updateApplication()` treats the *presence* of `input.status` as a state change and refreshes `updatedAt`; saving bookkeeping can therefore move a time-derived ghosted application back to Applied or Interviewing. This directly defeats the carefully documented rule that descriptive edits must not fake progress. Send only changed fields, and test the edit *through the modal/API path*, not just the service’s descriptive-only patch.  
   Evidence: `components/EditApplicationModal.tsx`; `lib/services/applications.ts`  
   Severity: blocker  
   Effort: M (half a day)  
   Layer: Code

2. **A confirmed step-back is two writes without one outcome.** `KanbanBoard` resets the timeline or adds a milestone, then separately PATCHes status. If the second request fails, the dialog reports failure and restores the card cache, but the first write has already changed the history on the server. Make “rewrite timeline and move” one server-side transaction; preserve “move without rewriting” as the separate explicit choice.  
   Evidence: `components/KanbanBoard.tsx`; `components/StepBackDialog.tsx`  
   Severity: major  
   Effort: L (a day or more)  
   Layer: Code

3. **The milestone editor cannot save a step as pending.** The Status select offers `pending`, `done` and `skipped`, but `saveEdit` converts every selected `pending` into `done`. “Save & mark done” is a useful fast path for the next step; it should not silently override an explicit selection when correcting a previously completed step. Separate the quick completion action from an ordinary Save, or make Save respect the selected status.  
   Evidence: `components/MilestoneTimeline.tsx`; `06-detail-light-1280.jpg`  
   Severity: major  
   Effort: M (half a day)  
   Layer: UX

4. **“Application progress” is not given its value in the interactive bar.** `components/ui/progress.tsx` destructures `value` to move the visual indicator but does not pass it to `ProgressPrimitive.Root`. A sighted user gets the percentage printed beside the bar; assistive technology gets a named progressbar without that value. Pass the value through and assert its exposed value in a component test. Axe passing is not proof that the announced number is useful.  
   Evidence: `components/ui/progress.tsx`; `components/ApplicationCard.tsx`  
   Severity: major  
   Effort: S (under an hour)  
   Layer: Code

5. **The product calls something “ghosted” without measuring the thing users mean.** The clock measures time since a *state or timeline change*, not time since an employer last responded. A candidate can receive a reply, add a note without moving state, and remain Ghosted; conversely a manual status move resets the clock without any employer contact. The automatic rule can still be valuable, but label it honestly as “no progress recorded for 10 days,” and distinguish that from a user-filed Ghosted state where the distinction matters. Do not imply the app detects silence in an inbox it deliberately never reads.  
   Evidence: `lib/services/applications.ts`; `lib/utils/status.ts`; `components/KanbanColumn.tsx`  
   Severity: major  
   Effort: M (half a day)  
   Layer: UX

6. **The main workflow has two authorities for status.** The detail page says progress lives on the timeline, while Edit exposes a Status selector, board drops PATCH status directly, and milestone completion may derive another status later. Manual Offer is terminal even if milestones remain incomplete; moving to Interviewing need not record an interview. Pick a legible contract: timeline changes record events, while manual status moves are explicit overrides; display that distinction on detail and use one transition policy across board, list and Edit. The current rules may be intentional individually, but the user cannot reliably predict their combination.  
   Evidence: `components/EditApplicationModal.tsx`; `components/ApplicationDetailsCard.tsx`; `lib/utils/status.ts`  
   Severity: major  
   Effort: L (a day or more)  
   Layer: UX

7. **The mobile default favours the showpiece over the job.** At 390px the board shows one 300px column and a slice of the next; getting to Ghosted, Rejected or Archived requires repeated horizontal travel, while a long first column demands vertical travel inside the same task. The list gives mobile users a continuous, labelled scan. Keep the board available and remember explicit preference, but default *first-time mobile users* to the list. Here legibility and reach beat Kanban’s spatial metaphor.  
   Evidence: `components/Dashboard.tsx`; `components/KanbanColumn.tsx`; `11-board-light-390.jpg`, `12-list-light-390.jpg`  
   Severity: major  
   Effort: M (half a day)  
   Layer: UX

8. **The landing page promises rules the app no longer has.** “Ghosted detection” says “two weeks,” while a new account defaults to 10 days and can choose 7 or 14. “Stats at a glance” advertises a dashboard summary that was deliberately removed. This is more damaging than a minor wording inconsistency: the page teaches an expectation that the first session contradicts. Describe configurable quiet-time grouping and the counts in view headings instead.  
   Evidence: `components/Landing.tsx`; `lib/utils/status.ts`; `components/Dashboard.tsx`  
   Severity: minor  
   Effort: S (under an hour)  
   Layer: UX

9. **The first action asks for a logo-repair field too early.** The Add application dialog puts optional “Company website” beside company, role and posting URL, without explaining that it is primarily a logo override. That is maintenance of presentation, not information needed to log an application. Keep it in Edit with its existing explanation, or tuck it under optional details; make the first-add form about recording the job.  
   Evidence: `components/AddApplicationModal.tsx`; `components/EditApplicationModal.tsx`; `13-add-modal-light-1280.jpg`  
   Severity: minor  
   Effort: S (under an hour)  
   Layer: UX

10. **The offer donation prompt competes with the workspace.** Seeded accounts with offers get a saturated banner above the board or list, including on mobile, where it occupies much of the opening viewport. Celebration and a voluntary donation ask are reasonable; permanent top-of-workspace priority is not. Keep the dismissal behaviour, but make the ask less prominent or show it at the moment an offer is first recorded rather than on every eligible workspace visit.  
    Evidence: `components/DonateBanner.tsx`; `05-board-light-1280.jpg`, `11-board-light-390.jpg`  
    Severity: minor  
    Effort: M (half a day)  
    Layer: UI

11. **The public trust copy is less settled than the product UI.** The imprint and privacy pages visibly say the legal entity is “to be formalized”; the privacy page says deletion happens “within 30 days,” while the account action deletes the database user immediately. These may reflect operational caveats, but they should not be presented as polished final policy beside “Private by design.” Resolve the factual wording with appropriate legal review, rather than adding more visual treatment.  
    Evidence: `app/(legal)/imprint/page.tsx`; `app/(legal)/privacy/page.tsx`; `lib/services/account.ts`  
    Severity: minor  
    Effort: M (half a day)  
    Layer: UX

## 4. Cross-cutting themes

- **Define one state-transition contract.** A decision table covering milestone edits, manual moves, outcomes, archive/reopen and the ghosted clock would prevent most of findings 1, 2, 3, 5 and 6. Test transitions from the user action through to the resulting detail and section.
- **Give words the same precision as the data model.** “Updated,” “quiet,” “ghosted,” “progress” and “done” currently carry different meanings in different places. Choose user-facing definitions once, then apply them to badges, helper copy, landing claims and tests.
- **Optimise the first screen for the task, not the strongest visual.** The mobile board, optional logo field and donation banner each consume attention before the next useful action. Retain the character of the design; change priority, not palette.
- **Test semantics as well as render states.** The existing test strategy is substantial, but a passing axe run, an isolated service test and a successful drag each miss a different failure above. A few end-to-end transition assertions are worth more here than broader snapshot coverage.

## 5. Action plan

| # | Action | Layer | Severity | Effort | Why this order |
|---|---|---|---|---|---|
| 1 | Pass `value` into the Radix progress root; assert the exposed value | Code | major | S (under an hour) | High-confidence shipping-gate fix with a tiny surface |
| 2 | Correct the landing’s “two weeks” and “Stats at a glance” claims | UX | minor | S (under an hour) | Removes two false promises immediately |
| 3 | Move or subordinate Company website in the add dialog | UX | minor | S (under an hour) | Simplifies the most important first action |
| 4 | Patch only changed Edit fields; regression-test note-only edits on a ghosted app | Code | blocker | M (half a day) | Repairs the core clock before changing its copy |
| 5 | Make Save honour the milestone status selection | UX | major | M (half a day) | Stops an explicit correction becoming a completion |
| 6 | Default first-time phone visits to List, retaining user choice | UX | major | M (half a day) | Improves routine access without removing the board |
| 7 | Make step-back confirmation a single transactional operation | Code | major | L (a day or more) | Prevents partial history writes; warrants a focused session |
| 8 | Write and enforce the status/clock transition contract, then revise its labels | UX | major | L (a day or more) | Larger work, but the durable fix for state ambiguity |

**Do not do**

- **Do not add reminders or inbox integration** to make “ghosted” more literal. They contradict the product’s useful privacy and low-noise boundary; fix the claim and recorded-event model first.
- **Do not replace the visual system.** The colours, type and light/dark pairing already do their job. A redesign would spend the solo-maintainer budget away from state correctness.
- **Do not add a drag-and-drop library solely for mobile.** The menu already supplies an accessible alternative; choose the better mobile default instead.
- **Do not restore the stat-card row.** Counts beside the actual groups are more actionable than a summary above the same groups.
- **Do not split the shared cards into separate landing and application implementations.** The server-rendered shell is an effective boundary; duplication would buy little and invite drift.

## 6. Uncertainty

These screenshots establish appearance, not whether people understand when to mark a milestone done, when to move a card, or what Ghosted means after a real employer reply. The single artifact that would settle the highest-impact uncertainty is **a recording of five first-time users logging an application, recording a reply, moving it backward and explaining where they expect it to appear afterward**. I also cannot verify email deliverability, production latency or the legal correctness of the published policy from this bundle; none should be inferred from passing tests or screenshots.