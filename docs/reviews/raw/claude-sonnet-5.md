# Ghosted — Design Review

## 1. Verdict

This is a solidly-executed mid-tier product with unusually mature software design underneath it — the kind of rigor (narrow invalidation, OKLCH color math, transactional reordering, board-equivalence tests) you rarely see from a solo project. The UI is competent, consistent, and accessible-by-construction. But the product is visually flat: every surface is a slightly-tinted grey card in a grey frame, nothing establishes a focal point, and the interface reads as "correct" rather than "considered" the way the backend clearly is. The single biggest thing holding it back: the interface has no visual hierarchy above the level of a single card — six identical grey columns, six identical grey sections, and a dashboard with no distinguishing landmark once you scroll past the hero-adjacent banner. The engineering effort clearly outpaced the interface polish.

## 2. What is genuinely good

- **The status-color system is genuinely thought through.** `lib/utils/card-styles.ts` picks one lightness/chroma per surface layer in OKLCH and varies only hue, specifically because Tailwind's ramp is perceptually uneven (amber-100 vs sky-100). This is real design craft, documented with the reasoning, and it's rare to see this level of color-science rigor in a solo project.
- **The "step-back" flow (`StepBackDialog`, `stepBackKind`) is a genuine UX insight.** Recognizing that dragging a card backwards is ambiguous — did a new round happen, or did the process restart? — and asking the right question based on direction (`add-step` vs `reset`) rather than a generic "are you sure" is the kind of domain modeling that separates a considered tool from a CRUD wrapper.
- **Ghosted-as-overlay, not stored status** (`displayStatusOf`) is elegant: it avoids a background job, stays consistent between SQL (`getStats`) and JS (`useApplicationSection`), and is explicitly protected against clock skew via `ghostedCutoff`. The double-accounting bug class ("shows in two columns") is explicitly called out and tested (`stats-ghosted-rule.test.ts`).
- **Empty/loading state sequencing is unusually careful.** `DashboardLoading`, `useAccountIsEmpty`, and the placement-known gating in `ApplicationList` all exist specifically to prevent the "flash of wrong chrome" problem (toolbar appears, then disappears; board renders then collapses to empty state). This is UX craft most teams skip.
- **The `ApplicationCardShell` server/client split** (screenshot 01, landing page cards) is a legitimately elegant solution to "one card, two contexts, no drift, no unnecessary client JS on the marketing page." Good abstraction boundary.
- **Copy is warm without being twee.** "Reading paranormal data…", "Nothing has gone quiet" (empty ghosted column, screenshot 05) — these land because they're restrained; one line, not a whole voice bit.

## 3. Findings

1. **The interface has no visual hierarchy beyond the card.** Board and list views (screenshots 05, 07, 08, 09) are walls of near-identical grey/white cards; the only differentiators are a badge and a thin colored border. On a 1280px board with 6 columns × 4-6 cards each, nothing draws the eye to what matters (offers, this week's ghosted count). A dashboard whose entire job is "help we track a chaotic process" should have one thing that pops — it currently has zero.
Evidence: screenshots 05, 07 (board view), lib/utils/card-styles.ts
Severity: major
Effort: M
Layer: UI

2. **The dashboard literally has no stats/overview surface.** The changelog explicitly says stat cards were removed "because every count they carried is already on screen" — but that's only true if a user scans six columns and mentally sums them. There's no single "you have 4 offers, 14 ghosted" glance-value; the closest is the donate banner, which only appears with an offer. For a tool whose value proposition is "see where your hunt stands," removing the stats view rather than fixing its design is a step backward.
Evidence: components/Dashboard.tsx (comment: "No stat cards..."), docs/ARCHITECTURE.md
Severity: major
Effort: M
Layer: UX

3. **The landing page mock and the app's real board disagree on furniture, undermining trust in the pitch.** The landing tab bar (screenshot 01) shows a tri-tab layout ("Applied / Interviewing / Ghosted") that doesn't exist anywhere in the actual product (which has 6-column board or grouped list). First-time visitors are being sold a UI they will never see.
Evidence: components/Landing.tsx (MockTab component), screenshots 01 vs 05/08
Severity: major
Effort: S
Layer: UX

4. **Company logos are absent for a large fraction of real-world seeded data**, forcing monogram fallback in most cards shown in screenshots 05/07/08/09 (Cal.com, Resend, cube ai, deel, Height, Duffel, Intercom, Eneba, Loom, Perplexity — all monograms). If the logo system is a advertised feature ("Company avatars"), and the demo/seed data can't consistently produce them, that's either a coverage gap in `company-domain.ts` heuristics or the feature is weaker than the engineering investment (260 lines, a whole caching service) suggests. Either the fallback needs better visual treatment (colored monogram per company, not uniform grey) or the domain-matching needs work.
Evidence: screenshot 05, 07, 08, 09; lib/services/company-logos.ts, lib/utils/company-domain.ts
Severity: minor
Effort: S (better monogram styling) / L (better domain matching)
Layer: UI/Code

5. **Six always-rendered board columns do not degrade gracefully at laptop widths.** `KanbanColumn` floors at `min-w-[300px]` and the strip scrolls horizontally rather than reflowing — meaning a 1280px screen (the given screenshot width) already can't show all 6 columns without scrolling (confirmed: screenshot 05/07 cuts off before "Rejected"/"Archived"). For the *primary* view of the app (board is the default), a majority of first-time desktop users never see two of six statuses without discovering the sideways scroll.
Evidence: components/KanbanColumn.tsx ("300px is a floor, not a fixed width"), screenshot 05 (only 4 of 6 columns visible)
Severity: major
Effort: M
Layer: UX

6. **Dense card layout duplicates "Updated X ago" as the only differentiator from "ghosted," on cards that are already colored violet for ghosted** — but the ghosted column header also says "auto after 10 days," which is column-scoped chrome that will be invisible once a user scrolls right past it. There's no per-card indication of *how* ghosted (how many days over threshold), which is exactly the information a "was this actually going to happen" tool should foreground.
Evidence: components/KanbanColumn.tsx (patienceDays footer), components/ApplicationCardShell.tsx
Severity: minor
Effort: S
Layer: UX

7. **The archived/rejected/ghosted color coding relies entirely on hue at identical lightness**, which is a real accessibility risk for the ~8% of men with red-green deficiency distinguishing "rejected" (red hue 17.7) from "interviewing" (amber hue 95.6) at a glance, especially since the badge is the *only* label carrying the word — colorblind users must read every badge text rather than pattern-matching color, which somewhat defeats the point of a color system. Given the amount of engineering effort already spent tuning OKLCH, an icon-forward design (the `StatusIcon` component already exists per status) should be leaned on harder — e.g., render the icon *larger* / more prominently on the card itself, not just inside the small badge.
Evidence: lib/utils/card-styles.ts, components/status-icons.tsx
Severity: minor
Effort: S
Layer: UI

8. **`ApplicationDetail`'s "Details" card mixes read-only display with a kebab menu that includes destructive actions (Archive) at the same visual weight as benign ones (Edit, Favourite).** Screenshot 06/14 shows the actions collapsed behind one `MoreVertical` icon with no visual distinction once opened — archiving/deleting an application (with data implications) sits in the same list style as toggling a star.
Evidence: components/ApplicationDetail.tsx (cardActions dropdown)
Severity: minor
Effort: S
Layer: UX

9. **The `RoleInput` autocomplete is a fully hand-rolled combobox** (keyboard nav, ARIA roles, pointerdown-vs-click handling) reimplementing behavior Radix already ships elsewhere in the app (Select). This is a maintenance and consistency risk: it's the one interactive primitive in the codebase not built on the same primitive library as everything else, meaning any future ARIA/Radix version bump will not automatically carry this component along, and any bug fixed in Select's combobox behavior won't be reflected here.
Evidence: components/RoleInput.tsx
Severity: minor
Effort: M
Layer: Code

10. **`lib/services/applications.ts` is 1175 lines and owns list querying, board querying, CRUD, milestone reordering, stats, and role autocomplete — a "the core" god-module by its own doc comment.** At 3x current scope (e.g. reminders, tags, multiple boards), this file becomes the place every change has to touch and every merge conflicts in. The seams are already visible (list vs board vs stats are conceptually separable); this is the one piece of software design here that doesn't match the polish of the rest.
Evidence: lib/services/applications.ts (1175 lines, file inventory)
Severity: minor
Effort: L
Layer: Code

11. **The board's `useBoardSeed` + `useApplicationSection` dual-fetch contract is clever but fragile**: correctness depends on both hooks agreeing on the exact same query-key shape (`["applications", "section", status, {search, sort}]`) with no shared constant enforcing it — it's duplicated as a literal array in two files. A key-shape drift between the two is a silent cache-miss bug, not a type error.
Evidence: components/use-board-seed.ts, components/use-application-section.ts
Severity: minor
Effort: S
Layer: Code

12. **Empty-state copy ("Add your first application") and CTA button (`add-first-application`) exist twice conceptually** — once via `ApplicationsEmptyState`, once via the dashboard's "nothing at all" gate in `useAccountIsEmpty` — with two different emoji/copy tone registers ("🎯" vs the drier settings copy). Minor, but it's the one place the app's otherwise-restrained voice gets a little much.
Evidence: components/ApplicationsEmptyState.tsx
Severity: nit
Effort: S
Layer: UX

13. **The donate banner's generated coffee-cup SVG pattern (`DonateBanner.tsx`) is ~80 lines of trigonometry to draw a background texture** that is barely perceptible at 12% opacity (screenshot 05, 07). This is effort spent on a purely decorative flourish nobody will consciously notice, in a component whose actual job (soliciting donations without being annoying) is otherwise handled well by the dismiss logic. Not wrong, just a strange place for that much code.
Evidence: components/DonateBanner.tsx
Severity: nit
Effort: S
Layer: Code

## 4. Cross-cutting themes

- **Every visual decision after the card is under-designed relative to the component-level decisions.** Card internals, color tokens, and states are meticulous; the *composition* of cards into columns, sections, and a page is generic Tailwind defaults (grey page, white/near-white cards, thin borders). One deliberate decision — establishing a real elevation/hierarchy system (e.g. only the *next actionable* item gets a stronger surface) — would fix findings 1, 2, and 6 in one motion.
- **The engineering investment in correctness (narrow cache invalidation, transactional reordering, SQL/JS clock parity) is not matched by an equivalent investment in information design.** The team clearly optimizes for "never show stale/wrong data" but hasn't asked "what's the one number/card the user needs to see first." A product-priorities pass (not a code pass) would help more than any of the individual findings.
- **The landing page and the real app have drifted** (finding 3) — a natural consequence of a fast-moving solo project, but worth a recurring check: any change to the real board/list chrome should also update the landing mock, or the mock should be generated from the same layout primitives rather than hand-copied tab markup.
- **One god-service (`applications.ts`) is where complexity concentrates.** Splitting board/list/stats read-paths from the mutation/transaction logic now, while it's "only" 1175 lines, is far cheaper than doing it at 3000+.
- **Color is being asked to do labeling work it can't fully do alone** (finding 7). The fix isn't more color tuning — it's making the icon+text badge (which already exists) the primary signal and treating hue as reinforcement, not the message.

## 5. Action plan

| # | Action | Layer | Severity | Effort | Why this order |
|---|--------|-------|----------|--------|-----------------|
| 1 | Fix the landing-page mock tab bar to match the real board/list UI | UX | major | S | Highest impact/effort ratio; it's a trust problem for every new visitor and a copy-paste fix |
| 2 | Add a lightweight stats strip back (even just 4 numbers: active / interviewing / offers / ghosted) above the toolbar, styled distinctly from cards | UX | major | M | Restores the "glance value" the product's job-to-be-done depends on |
| 3 | Give the board a responsive breakpoint so ≤4 columns are visible without horizontal scroll on common desktop widths (e.g. collapse to 3-up with scroll below 1440px, or shrink column min-width) | UX | major | M | Directly affects the default view's first impression on the review's own 1280px screenshots |
| 4 | Introduce one visual "importance" tier — e.g., offers/interviewing get a slightly elevated card treatment (shadow, or a subtle accent bar) vs applied/ghosted/archived | UI | major | M | Cheapest way to break the "wall of identical cards" problem without redesigning card internals |
| 5 | De-duplicate the board query-key shape into one shared constant/helper used by both hooks | Code | minor | S | Removes a silent-cache-bug risk for near-zero cost |
| 6 | Improve monogram fallback styling (per-company deterministic color, not uniform grey) so the common "no logo" case still looks intentional | UI | minor | S | High visibility (most seed data hits this path) for low effort |
| 7 | Split `applications.ts` into board/list read-service vs mutation-service modules | Code | minor | L | Worth doing before the file grows further, but not urgent — sequence after the UX fixes |
| 8 | Replace hand-rolled `RoleInput` combobox with Radix Combobox/Command primitive already available in the design system's family | Code | minor | M | Consistency and long-term maintenance win, lowest urgency |

**Do not do:**
- **Do not add a drag-and-drop library.** The native HTML5 implementation is deliberate (documented, tested, dependency-free) and works correctly with a keyboard/touch fallback already in place. A reviewer suggesting "use react-beautiful-dnd for smoother drag" would be trading a working, tested, dependency-free system for cosmetic polish.
- **Do not add push/email notifications.** It's explicitly a stated non-goal on the landing page and matches the product's actual positioning ("a logbook, not a robot"). Suggesting it would contradict the product's own thesis.
- **Do not build a "one board endpoint" refactor right now** (the architecture doc itself flags this as the biggest remaining perf win but deliberately deferred it as needing "its own session"). Respect that call — it's a big paging-contract change for a performance win that hasn't yet been shown to matter to real users at the current data sizes.
- **Do not introduce a component library upgrade or swap shadcn/ui for something else.** The existing system is coherent and consistently applied; the problems found here are compositional/layout, not primitive-level, and a library swap would cost far more than it fixes.
- **Do not add more decorative animation (icon-tornado rings, coffee-cup patterns) anywhere else.** The existing ones already outweigh their perceptual impact; more of this pattern would be effort spent in the wrong place given finding 1's higher-priority hierarchy problem.

## 6. Uncertainty

- **I cannot judge real-world logo-hit-rate** beyond what the seed data shows (mostly misses). The `company-domain.ts` heuristics may perform much better on a live user's actual application set (which likely has fewer job-board-only URLs than a stress-test seed). Settling this needs a metric: % of active applications with a resolved logo, sampled from real (non-seed) accounts.
- **I cannot judge whether board-vs-list is actually the split real users want**, or whether one view dominates usage — this affects whether finding 3 (board width) or finding 2 (stats) matters more. Settling this needs basic product analytics (already present via self-hosted umami) on view-toggle usage and session view-time per view.
- **I cannot assess motion/transition quality from static screenshots** — drag interactions, dialog enter/exit, and the "detach on drag" optimistic UI are all described in code comments as carefully tuned but are inherently unjudgeable without a video or live session.
- **I cannot verify actual contrast ratios for the OKLCH-derived card/border/badge combinations** beyond the one documented in-code fix (destructive text at 1.98:1). A full automated contrast sweep across all six status × two theme combinations (12 card/badge/border sets) would settle whether the "one lightness per layer" system holds up as well as it's claimed to, beyond the axe-gated pages already covered by CI.