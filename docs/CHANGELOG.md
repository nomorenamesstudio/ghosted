# Changelog

All notable changes, by date and type.

## 2026-09-17

### Changed
- **Board controls live in the header on a wide screen** (xl, 1280px+): search,
  sort, the List/Board switch and "Add application" portal into a right-aligned
  slot beside the account menu, so the header is sticky while the columns get
  the full width beneath it. Below that width — and in list view — they keep
  their own row, and nothing changes for list view at any width.

### Fixed
- **Only state changes count as an update.** Editing the company website, notes
  or contact details no longer moves `updated_at`, so bookkeeping can no longer
  un-ghost a silent application, rewrite its "Updated …" line or reshuffle the
  list sorted by last updated. Status changes (including archive and reopen) and
  timeline changes still count — and because the website edit no longer versions
  the logo image, the lookup inputs are now part of the logo URL's cache key.
- **Light mode is legible now.** The page was pure white and so were the cards,
  columns and borders, which left the paler status tints and the progress tracks
  nearly invisible on a bright screen. The page is off-white (`--background`
  95%), columns and cards are white on top of it, hairlines went from 90% to 80%
  lightness, `--muted` surfaces to 88% and `--muted-foreground` text to 33%; the
  status tints moved from `*-50/70` to `*-100` and the progress tracks from
  `*-200/60` to `*-300`. Dark mode is untouched. Verified numerically (border
  vs page 1.32 → 1.46:1, progress track vs card 1.12 → 1.45:1, meta text 6.96:1)
  because axe only audits text contrast, not surfaces.
- The **List / Board switch shows which view is active**. It was built from
  `Button variant="secondary"`, which sits within ~1.1:1 of its own background
  in both themes — the selected side looked unselected. It is now a segmented
  control (`components/ViewToggle.tsx`): a raised card-coloured chip with a
  shadow on a muted track.
- The footer is as wide as the header in board view (it carries the same
  `app-shell` class now, so the full-width rule reaches it).
- The empty kanban column's "Drop an application here" prompt sits directly
  under the column header instead of vertically centred — in a long column it
  used to float in the middle of nothing.

### Added
- **Patience level** setting (Settings → between Appearance and Profile): how
  long an application may sit silent before it is shown as ghosted — Generous
  (14 days), Realistic (10 days) or Impatient mode (7 days) — each with its own
  face in the dropdown (grinning / slightly smiling / angry). Stored per user
  (`users.patience_level`, default `realistic`), saved on change, and applied
  everywhere the threshold matters: the list and board grouping, the status
  filter, and the dashboard's ghosted count.
- **Kanban board view** for the application list, switchable from the toolbar
  and the **default view** (List / Board, remembered per browser). Columns run in pipeline order —
  Applied → Interviewing → Offers, then Ghosted, Rejected, Archived — and cards
  are dragged between them to change status, with a "Move to" menu on every card
  as the touch/keyboard route. Columns take a 300px floor and then share any
  spare width evenly, so a wide window is filled instead of leaving a gap after
  the last column (and six of them on a laptop scroll rather than squash).
  Board-specific behaviour vs the list: the page
  and header widen to the full window, the stat cards and the status filter step
  aside (the columns *are* the statuses), every column stays visible when empty
  (so there is always a drop target), `archived` is always shown, and the
  derived `ghosted` column accepts no drops. Columns share the list's query
  keys, search and sort, so switching views never refetches and both stay in
  sync.
- **Step-back guard on the board**: dragging a card *backwards* through the
  pipeline asks first, and the question depends on the stage it came from —
  back from Offers asks whether to record the round that happened (`Add step and
  move`), while Interviewing → Applied asks whether to **reset the timeline**
  (`POST /api/applications/:id/milestones/reset`: every step back to pending,
  dates cleared, progress 0%). Both dialogs also offer a tertiary `Leave it as
  is, but move` that moves the card without touching the timeline, and Cancel
  writes nothing at all. Moves out of an outcome status (un-ghosting, reopening
  an archived application) are progress, not a step back, and are not
  interrupted.
- Company avatars on application cards **and on the application detail page**
  (a larger chip next to the headline, with a matching loading skeleton): each
  shows a 24px/32px logo chip in front of the company name, falling back to a
  neutral monogram of the company's first letter. Logos are resolved lazily on first view, cached in
  the new `company_logos` table (keyed by domain, so two applications at the
  same company share one row) and served from our own origin by
  `GET /logos/:applicationId` with `immutable` caching versioned by the
  application's `updatedAt`.
- New optional **Company website** field on the add and edit forms (stored as a
  normalised domain, `stripe.com`), which feeds the logo lookup and overrides
  every guess - the fix for a pasted job-board link or an ambiguous company name
  like "Acme". Left empty, the resolution chain runs exactly as before.
- Job-board links are recognised and stripped before a lookup
  (`linkedin.com/jobs/...`, `boards.greenhouse.io/acme/...`,
  `acme.myworkdayjobs.com`), so the employer's logo is used rather than the
  posting board's. A company that yields no icon is cached as a miss, so a
  logo-less company is not re-fetched on every render.

### Changed
- **Card layout rework** (list and board): one structure in both views — the
  logo, company name and its favourite star on the first line, the role breaking
  onto a second line at the same left edge, the status badge pinned to the card's
  top-right corner, then a full-width hairline, and under it the "last round /
  updated" line with the progress bar to its right (stacked, with the board's
  "Move to" menu at the bottom-right, inside a kanban column). The company name
  is a step smaller (`text-sm`) and the logo is sized to match the two-line
  identity block (36px).
- The ghosted threshold is now 10 days by default (was 14 — that is the new
  "generous" level) because every user starts on `realistic`. Applications that
  still looked active while 10–14 days stale now show under Ghosted until the
  level is changed in Settings. `GHOSTED_AFTER_DAYS` is no longer the source of
  truth — it is the fallback for code paths with no user in hand.

### Fixed
- The board keeps its left padding on mobile: scroll snapping ignored the
  container's padding, so it auto-scrolled 16px on load — the first column sat
  flush against the screen edge and the padding reappeared as dead space at the
  right (`scroll-px-4` now matches the padding).
- A rejected application no longer reports 100% progress — it shows the state it
  actually reached (3 of 5 steps → 60%), the same way an archived application
  already did. Offers still read 100%: that one is the successful end.
- The step-back dialogs no longer spill their text past the dialog edge: three
  actions in one footer made the dialog's grid column wider than the dialog
  itself, which pushed the title and description outside its padding. The
  tertiary "Leave it as is, but move" now sits above the footer, and the footer
  keeps the app's standard Cancel + primary shape.
- The board no longer strands itself on "No applications yet" after a search
  that matches nothing is cleared. The columns own the queries, so they now stay
  mounted (hidden while the empty state is on screen) instead of being unmounted
  with it - with nothing mounted, clearing the search had nothing left to
  refetch.

## 2026-09-03

### Added
- Self-hosted umami analytics (tracker served from `ramen.lostsignals.studio`):
  script tag in the root layout head with `data-cache` and a
  `data-domains` guard so only `ghosted.lostsignals.studio` traffic is
  recorded; CSP in `next.config.mjs` whitelists the umami origin for
  `script-src` and `connect-src` (tracker load + `/api/send` beacons).

## 2026-08-31

### Fixed
- Login page is now force-dynamic: the Google/LinkedIn button visibility is
  read from runtime env instead of being baked in at build time, so adding
  `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` on Railway takes effect on the next
  deploy without confusion about stale static HTML.

### Changed
- Login UI: Sign in button got a LogIn icon; Google button restyled with the
  official multicolor Google G (18px) and reordered below the Sign in button
  with the "or" divider between them (Google-brand white styling, dark-mode
  aware).

## 2026-08-27

### Added
- Social share image (`public/og.png`, 1200x630) replicating the landing hero
  (violet gradient, ghost + email-tornado icon rings, "Ghosted" logotype with
  aligned superscript beta, slogan), wired into `og:image` and
  `twitter:image` (summary_large_image) meta tags via the root layout.
- Email verification feature: verification banner (muted amber Card in the
  dashboard flow), verification modal shown at the app cap instead of the
  add-application form, `UNVERIFIED_APP_LIMIT` env var (default 3),
  server-enforced 403 `EMAIL_UNVERIFIED_LIMIT` on the 4th application.
- `middleware.ts`: `Cache-Control: no-store` on all `/api/*` responses.
- `docs/` documentation suite (this changelog, API, Architecture, Setup,
  Index); README slimmed from 310 to 92 lines.
- CI e2e coverage: stress test (220 applications), axe a11y checks.

### Changed
- OAuth account linking now only attaches a verified email; unverified
  squatted accounts are adopted for the verified OAuth identity with their
  password hash cleared.
- Rate limiting hardened: per-endpoint scopes, per-account throttles
  (header-independent), success resets, per-user write limits, and the IP
  extraction now trusts the last `X-Forwarded-For` entry (proxy append).
- Session cap: 7-day absolute cap enforced via an `authTime` claim in the
  jwt callback (an `exp` pin alone is useless - `@auth/core` re-signs the
  JWT on every request).
- Docker: base image `node:22-alpine`, pinned pnpm via
  `npm install -g pnpm@10.12.1`, prod-only deps (`pnpm prune --prod`),
  non-root `USER node`, and `package.json`/lockfile copied before pruning.
- Production CSP drops `'unsafe-eval'`; HSTS header added; `AUTH_URL`
  derived from `NEXT_PUBLIC_APP_URL` in production.
- Registration unique-violation race returns 409 instead of 500.
- Text-only modals (ConfirmDialog, VerificationModal) use `text-base`
  description with doubled title-content spacing.
- Migration runner takes a Postgres advisory lock for multi-replica deploys;
  used/expired verification and reset tokens are purged on new issue.

### Fixed
- **Cross-user data leak on logout/login** (security): the TanStack
  QueryClient survives client-side navigation and the client SessionProvider
  does not refetch during it, so a new user saw the previous user's cached
  applications/stats until a manual refresh. Fixed by explicitly clearing the
  query cache at the three auth transitions (login, register, sign-out) plus
  `Cache-Control: no-store` on API responses.
- Verification banner not showing after register (client session staleness):
  the dashboard now reads `emailVerified` directly from the DB, and the
  verify-email form refreshes the session unconditionally.
- Banner a11y: Resend button contrast raised to amber-700 (5.02:1) after axe
  flagged white-on-amber-600 (3.18:1); banner content wrapped in a proper
  landmark.
- Milestone `step_order` races: concurrent writes serialize on the
  application row (`SELECT ... FOR UPDATE`).
- `UPDATE` statements for reopen/favorite now include `userId` in the WHERE
  clause (defense in depth).

### Security audit
The multi-model security audit (2026-08-27) is closed: all 19 actionable
findings are fixed and deployed. Remaining items are accepted for MVP
(verification token in the URL query string, email PII in plaintext logs,
placeholder legal pages, dev-only email preview).

### Removed
- Umami analytics (added and reverted the same day - it is blocked by most
  browsers; self-hosting planned later). Rollback commit `d9c2c45`.

## 2026-08-26

### Added
- Full application CRUD, milestone timeline with reordering, dashboard stats,
  search/filter/sort, reversible archive, OAuth + email/password auth,
  night mode, GDPR export/delete, email verification + password reset flows.
- CI workflow (lint, typecheck, unit/integration, e2e).

### Fixed
- N/A (initial MVP work).
