# Design review — Ghosted, 2026-09-24

**Status: Tier 1 fixed, plus the silence-clock decision below.** Findings 1, 2
and 3 shipped in the commit that added this file; the ghosted clock now advances
only on employer-facing events (see `docs/CHANGELOG.md`, 2026-09-24). Findings
4–10 are still open, and the product owner ruled out inbox detection as an
implied promise — the landing page has said "No email scanning" all along, so
the reviewer's reading was wrong there.

Two independent model reviews of the whole project (product/UX, interface, software
design), run against the actual source plus 15 fresh screenshots, then checked
against the code and the running app before anything was put in the action plan.

- Raw review: [`raw/claude-sonnet-5.md`](raw/claude-sonnet-5.md) — `anthropic/claude-sonnet-5` via OpenRouter
- Raw review: [`raw/gpt-6-sol.md`](raw/gpt-6-sol.md) — `openai/gpt-6-sol` via OpenRouter
- Evidence bundle sent: full source of `app/`, `components/`, `lib/`, `types/`, configs, the docs, a file inventory with line counts and the test-title inventory (544 KB), plus 15 screenshots of the running app at 1280px and 390px in both themes.
- Cost: ~$0.54 + ~$0.43. Runtime: 89 s and 88 s.
- Screenshots and the harness scripts live in `.tmp-review/` (gitignored) and can be regenerated: `.tmp-review/design-shots.mjs`, `.tmp-review/design-shots2.mjs`.

## Verdict

Both reviewers rate the engineering above the interface. GPT-6-Sol: "a credible
shipped product with a distinctive, mostly disciplined interface and unusually
careful engineering for a solo build — its weakest layer is the meaning of its
states." Claude Sonnet 5: "competent, consistent, accessible-by-construction, but
visually flat — the engineering effort clearly outpaced the interface polish."

They split along a useful line: GPT-6-Sol reviewed **state semantics** and found
real defects; Claude reviewed **composition** and found the wall-of-identical-cards
problem. Neither is a redesign verdict. Nothing in either review says the visual
language is wrong.

## Verified findings, ranked

### Tier 1 — confirmed defects, cheap to fix

1. **A note-only edit un-ghosts a ghosted application.** `EditApplicationModal.snapshot()`
   always sends `status`, and `updateApplication()` treats the field's *presence* as a
   state change (`lib/services/applications.ts:702`), moving `updated_at`. The service
   comment at line 697 states the opposite intent.
   *Reproduced*: backdated a demo application 40 days (`status = applied`, patience
   `realistic`), edited only the notes through the real modal →
   `updated_at` 2026-08-15 → 2026-09-24 and the card left the Ghosted column.
   Fix: send only changed fields from the modal (the API already merges per field).
2. **Every progress bar announces no value.** `components/ui/progress.tsx` destructures
   `value` for the indicator transform but never passes it to `ProgressPrimitive.Root`.
   *Reproduced in the running app*: every `[role="progressbar"]` is
   `aria-label="Application progress"`, `aria-valuenow=null`, `aria-valuemin=0`,
   `aria-valuemax=100`. Axe passes, which is why CI never caught it.
   Fix: pass `value` through; assert the exposed value in a component test.
3. **The landing page promises things the app no longer does.** `components/Landing.tsx:65`
   says "go quiet for **two weeks**" while the default patience is `realistic` = 10 days
   (`lib/utils/status.ts:56-60`), and `Landing.tsx:69` advertises "Stats at a glance"
   for stat cards that were deliberately deleted (`components/Dashboard.tsx:119-123`).
   Fix: describe the configurable quiet window; drop or rewrite the stats claim.

### Tier 2 — real gaps, half a day each

4. **"Save & mark done" cannot save a step back to pending.** `MilestoneTimeline.tsx:65`
   converts any selected `pending` into `done`, so correcting a previously completed
   step back to pending is impossible. The label is honest about the fast path; the
   problem is that there is no ordinary save.
5. **Mobile defaults to the showpiece.** At 390px the board shows one 300px column plus
   a slice (`KanbanColumn.tsx:102`), so reaching Rejected/Archived means repeated
   horizontal travel. Default first-time phone visitors to List, keep the choice.
6. **The board hides two of six statuses at laptop width.** `BOARD_ORDER` is six
   statuses (`lib/utils/status.ts:128`), each column floors at `min-w-[300px]`; at
   1280px only Applied/Interviewing/Offers/Ghosted are visible — Rejected and Archived
   are off-screen on the default view. Either drop the floor at `lg` or reduce the
   visible set.
7. **One visual importance tier.** Both reviewers agree the palette is fine; Claude's
   finding is compositional — six identical grey columns and a page with no landmark.
   The cheap experiment: give Offers (and only Offers) a distinct surface treatment and
   see whether the board reads faster.

### Tier 3 — worth a session each

8. **The confirmed step-back is two writes, not one outcome.**
   `KanbanBoard.confirmStepBack` awaits `resetTimeline`/`addMilestone` and *then*
   `updateApplication`; a failure between them leaves rewritten history with the old
   status. Make it one server-side transaction, keeping "move without rewriting" as the
   explicit alternative.
9. **Write down the status/clock contract.** Timeline edits, manual moves, manual
   terminal states, archive/reopen and the ghosted clock can currently contradict each
   other. A one-page decision table plus transition tests is the durable fix behind
   findings 1, 4 and the "Updated / quiet / ghosted" vocabulary.
10. **`lib/services/applications.ts` is 1175 lines** and owns list reads, board reads,
    CRUD, milestone ordering, stats and role autocomplete. Split read-paths from
    mutations before it doubles.

## Where the two disagree

- **Stat cards.** Claude wants a 4-number stats strip back above the toolbar; GPT-6-Sol
  says do not restore them (counts already sit in the column/section headers). I side
  with GPT-6-Sol: ghosted is derived, so a stale application is displayed in *both*
  Applied and Ghosted — a totals strip would need its own rules to avoid double
  counting. Fix the landing claim instead; revisit with usage data.
- **Mobile board.** Claude treats board width as a desktop breakpoint problem, GPT-6-Sol
  as a mobile default problem. Both are true; the mobile default is the cheaper one.
- **Donate banner.** Claude calls the coffee-cup SVG "~80 lines of trigonometry"; the
  file is 124 lines total and the pattern is not the problem. The real note from
  GPT-6-Sol stands: on mobile the banner eats the opening viewport. Downgraded to a nit.
- **Destructive-action styling.** Claude says Archive sits at the same visual weight as
  Favourite; there *is* a `DropdownMenuSeparator` and a confirm dialog
  (`ApplicationDetail.tsx:185-213`). Downgraded to a nit.

## Do not do

1. Do not add reminders, push or inbox scanning to make "ghosted" literal — it breaks
   the product's stated boundary. Fix the label.
2. Do not rebuild the palette or the OKLCH card-surfaces system; both reviewers call it
   the strongest part of the UI.
3. Do not add a drag-and-drop library — the native implementation has a working menu
   fallback; fix the mobile *default* instead.
4. Do not restore the stat-card row (see above).
5. Do not split the shared card shell into landing and app versions, and do not swap the
   component library; the problems are compositional, not primitive-level.

## Method note

Both models were sent the same bundle. Claude Sonnet 5's first attempt returned an
empty completion: it spent the entire 12 000-token output budget on reasoning. Re-run
with `reasoning.effort = medium` and a 40 000-token cap.
