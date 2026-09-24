# Changelog

All notable changes, by date and type.

## 2026-09-24

### Added
- **The list view's cards carry the "Move to" menu.** Status changing was the
  board's privilege: a card in the list could only be moved by opening the
  application and editing its status. Every list card now has the same kebab the
  kanban card has, in the same corner, offering the same targets in the same
  order (`MOVE_TARGETS`; `ghosted` is absent because it is derived from
  inactivity rather than set). The menu itself moved out of `KanbanCard` into
  `components/MoveToMenu.tsx`, which owns no mutation and no positioning — the
  caller supplies `onMove` and the corner — so the two views cannot drift apart.
  The trigger is a *sibling* of the card's `<Link>`, not a child: a button inside
  an anchor still follows the href, which would have made every menu click
  navigate to the detail page. The list card passes `reserveActions`, so the
  progress bar stops short of the trigger instead of running underneath it: 9px
  of clearance at every width. The kebab is centred on the bar rather than
  dropped in the corner like the board's — 11px above the card's bottom edge
  against a 28px trigger, because the bar's centre sits 25px up (p-4, the 1px
  card border, half a 16px row). Measured delta at 1280, 1024, 640 and 390px:
  0px, and the board's own kebab was brought to the same rule (it was 1px out).
  The card's "Last round" and "Updated" share one row on the list card — the
  same row carries the bar, and a stacked pair would make the bar the taller
  block's centre, which `items-center` then floats off the card's last line, the
  line the kebab is aligned to. The pair wraps to two lines only when it does not
  fit (verified by measurement at ten widths from 1440 down to 390px, and by
  forcing the wrap on desktop, where the demo data never triggers it): the
  separator travels inside the date's own element, because as its own flex item
  it would be left dangling at the end of the first line. The bottom row is
  bottom-aligned rather than centred, so the bar keeps the last line when the
  pair does wrap. The board's card is much narrower and keeps the stack. The
  list's move is deliberately plain
  where the board's is optimistic: `components/use-application-move.ts` PATCHes
  the status and invalidates only the two sections the move can have changed —
  plus `ghosted`, which displays stale applied/interviewing applications — the
  `stats` totals, and the application's own detail cache. A drag has to feel
  like it landed; a menu selection has nothing to honour, so the card simply
  leaves when the refetch arrives. Covered by
  `tests/component/application-card.test.tsx` (the trigger is outside the link,
  the move names its source status, the current status is not offered),
  `tests/component/use-application-move.test.tsx` (the PATCH, the narrow
  invalidation, the ghosted section, the surfaced error) and
  `tests/e2e/list-move.spec.ts` (move out of and back into a section through the
  real UI).

### Fixed
- **The shell width follows the view you are in, not the route you are on.** Board
  is the wide view, and the header goes with it: a detail page reached from the
  board keeps the wide frame, one reached from the list keeps the narrow one, and
  a reload changes neither — which is what the stored preference is for, and what
  it was failing to do. Only the *content* column is the board's own: the detail,
  settings and legal pages stay a column whatever view you came from, so the shell
  rules are two now — `html[data-view="board"] header .app-shell` for the frame
  (set on every route, because it follows the view) and
  `html[data-board-content] main.app-shell` for the content (set on the dashboard
  only, because that is the only content that widens). The pre-paint script sets
  both, so the board still opens at its real width rather than reflowing a moment
  later, and `Dashboard` keeps them in sync with the toggle — deliberately leaving
  `data-view` alone when it unmounts, since the frame belongs to the view rather
  than to that page. Measured at an 1800px window: board dashboard 1800/1800,
  detail from board 1800 header with a 1024 column, detail from list 1024/1024,
  and identical figures before and after a reload in every case. Covered by
  `tests/e2e/shell-width.spec.ts` for both views, which asserts the reload
  equality directly.
- **The status colours were 2.3x apart in perceived intensity.** Every status
  used the same Tailwind step (`bg-amber-100`, `bg-emerald-100`, …), and that step
  is not perceptually even: measured in OKLCH, `interviewing` sat at chroma 0.058
  and `offer` at 0.051 while `rejected`, `ghosted` and `applied` sat at 0.031,
  0.028 and 0.025. Same "100", twice the colour — so the interviewing and offer
  cards shouted next to a ghosted one, and the board read as a board of different
  designs. `lib/utils/card-styles.ts` now authors every status in `oklch()` with
  one lightness and one chroma per layer, only the hue changing: surface
  `0.951 0.030`, border `0.885 0.050` with a `0.845 0.070` hover, progress track
  `0.862 0.062`, each with a dark twin. Measured after: every status sits at
  exactly 0.030 / 0.050 / 0.062 — a spread of 1.00x, where it was 2.32x. Status is
  now carried by hue, and by the badge, which stays one step louder than the card
  it labels; the progress *fill* is the one element left on the Tailwind ramp,
  being the part meant to be vivid, and `archived` stays neutral as the only
  status that is not a hue. The tokens are written out as full class names —
  Tailwind reads the source text, and the first attempt assembled them in a
  template literal, which generated nothing and rendered every card transparent
  until a browser measured it. Verified: tsc and lint clean, 252 unit/component
  tests, full e2e 28/28 (axe scan included, so no contrast regression), and the
  palette re-measured from the rendered page in both themes.

### Removed
- **The dashboard's stat-card row.** The six counted cards only ever rendered in
  the list view (the board hid them, since its columns already show every count),
  and the list shows the same totals in each section header — so the row was a
  summary of a summary, sitting between the toolbar and the first section and
  taking the top of the page with it. `DashboardStats` and its `stat-*` test ids
  are gone; the section headers now carry `data-testid="section-count-<status>"`,
  which is what `tests/e2e/section-counts.spec.ts` (replacing `stats.spec.ts`)
  asserts after a milestone-driven status change. Clicking a card to filter is
  likewise gone with them — the toolbar's status dropdown was already the other
  way to do it, and it is now the only one. `getStats` itself stays: the donate
  banner reads its offer count, and the ghosted-rule integration test still
  guards the SQL against the rule the board and the list apply in JavaScript.
  Verified: tsc and lint clean, 252 unit/component tests, full e2e 28/28.

### Fixed
- **The app was never actually using its own font.** `app/layout.tsx` loads Geist
  Sans and Geist Mono through `next/font/local` and puts them on the body as
  `--font-geist-sans` / `--font-geist-mono` — and nothing ever read those
  variables: `fontFamily` was never mapped in `tailwind.config.ts`, so Tailwind's
  preflight kept the base family at the browser's own stack and every page
  rendered in the system fallback face. The brand wordmark showed it worst, which
  is how it was spotted: the fallback's bold "G" has a spur and a different
  optical weight from the rest of the header. `fontFamily.sans`/`mono` now lead
  with those variables (system stack kept behind them as the fallback), and the
  variables moved from `<body>` to `<html>` — preflight sets the base family on
  `html`, and a `var()` that is undefined there makes the whole declaration
  invalid at computed-value time, which is what dropped the fallbacks as well
  when the mapping was first added (the page fell all the way back to the
  browser's serif default until the variables were defined on `html`). Verified
  in the browser: the family resolves to the Geist variable and `document.fonts`
  reports it `loaded`, where it was `unloaded` before.
- **The list view's section headers lined up with nothing.** Their content sat
  flush with the card's outer edge while every card's own content starts at its
  16px padding, so a section title hung off the side of the list it titled.
  `pl-[17px]` (the card's `p-4` plus its 1px border) puts the status icon on the
  same left edge as the logo at the head of every card below it — measured at
  388.73px against the card's 388.49px in the real window.

### Fixed
- **Icons beside text sat low, because a line box reserves space the text never
  uses.** `items-center` centres an icon's *box* on the text's *line box*, and a
  line box keeps room below the baseline for descenders — which uppercase titles
  and "Ghosted" have none of. So the box centres matched to the hundredth of a
  pixel while the ink did not, which is what the eye reads as "not centred"
  (measured from the rendered pixels in a real window: the section icon's ink sat
  1.87px below the caps' ink on a 1.333 device-pixel ratio, the brand's ghost
  0.75px below the wordmark). Both now carry a one-line optical nudge —
  `-translate-y-0.5` on the section's status icon, `-translate-y-px` on the brand
  mark — and measure at -0.37px, which is the quantisation floor at a fractional
  DPR rather than a real offset. The derived rule, worth knowing before adding
  another icon+text pair: the offset is `(descent - ascent)/2 + capHeight/2` and
  it is *independent of line-height*, so no leading tweak can fix it — only an
  explicit nudge can. (The count pill's digit is not affected: it shares the
  caps' baseline exactly, it is only shorter because it is set at 12px.)
- **The archived pill had no fill, because it was painted the colour of its own
  card.** Archived was the one card with no hue — `bg-muted` — and the muted badge
  variant is filled with that same token, so the chip came out at exactly zero
  contrast: measured L 0.905 against L 0.905 in light mode, and L 0.274 against
  L 0.274 in dark, where every other status pair sits 0.046 apart (light) and
  0.158 (dark). It rendered as bare text on the card. The archived card now takes
  a neutral surface at the same lightness as its five siblings, chroma 0 —
  `oklch(0.951 0 0)` light and `oklch(0.22 0 0)` dark — which also replaces the
  translucent `bg-muted/20` dark value with an opaque one, and the muted badge
  variant gains a dark fill at the weight the -900 fills sit at. Measured after:
  archived card against its pill is 0.046 light and 0.150 dark, against 0.046 and
  0.158 for offer — the same chip weight as every other status. The progress track
  and fill came along: neutrals at the family's own lightness now, rather than the
  "couple of steps darker" they were tuned to when the card behind them was grey.

## 2026-09-23

### Added
- **Gravatar for email/password users.** Accounts created with an email address
  now show their Gravatar in the user menu; Google/LinkedIn users keep the
  provider photo, and an email with no Gravatar keeps the initials exactly as
  before. The lookup asks Gravatar with `d=404`, so "no account" comes back as a
  404 rather than a placeholder picture we would have to pass off as the user,
  and it runs once — in the `jwt` callback, guarded by
  `account?.provider === "credentials"`, because that callback also fires on
  every session read and must stay network-free. A hit stores `/avatars/<hash>`
  in `session.user.image`; a miss leaves it unset, so a user with no Gravatar
  makes no image request at all. Requesting an avatar never sends the browser to
  gravatar.com: `GET /avatars/:hash` proxies the bytes through our own origin,
  because Gravatar's own cache is only `max-age=300` and every browser would
  otherwise re-ask them every five minutes. Ours is `private, max-age=604800,
  stale-while-revalidate=86400` on a hit and `private, max-age=3600` on a miss
  (an account can be created on Gravatar at any time), with the upstream body
  re-validated before it is served — raster types only, 512KB cap, nosniff — so
  an HTML error page can never be cached as an avatar. No schema change: the
  picture lives in the JWT, as the Google one always has. Covered by
  `tests/unit/gravatar.test.ts` and `tests/integration/avatars.test.ts`.

### Changed
- **The list view keeps an Archived section, closed, below the empty state.**
  Archived applications are no longer hidden from the list: they have their own
  section at the bottom, closed until asked for. With nothing stored it starts
  closed, and a preference stored before the section existed (which knows nothing
  about it) is migrated to closed rather than left open. Because it sits below the
  empty state, an account whose applications are all archived still sees one —
  worded "No active applications", which is what the list's empty state actually
  means now that archived is visible below it (the board's columns cover every
  status, so its wording is unchanged). The call to action stops saying "first"
  when something is already archived. Covered by `tests/e2e/delete.spec.ts`, which
  archives through the UI, then checks the wording, the section's position below
  it, that it is closed, and that opening it shows the application.
- **The dashboard shows one loading state instead of a half-drawn page.** Which
  shape the page takes — board, list, or the empty state — depends on the stored
  view, the account's totals and each section's first page, and all of that lives
  in the browser. The banner, the stat cards and the board used to render before
  any of it was known: an account with no applications briefly saw a verification
  banner, and everyone saw a search box, six empty columns and zeroed counters
  rearrange themselves as the data landed. Nothing below the header renders now
  until the view is settled and the seed has come back — just a large pulsing
  ghost and "Reading paranormal data…". No card placeholders on purpose: a
  skeleton card promises a list of applications, and until the totals are in we do
  not know whether there will be a list at all. The empty state waits for that
  data too — it is the *result* of the load, not an input to it, and letting a
  zero-count account through early rendered the board over its own skeletons for
  a few hundred milliseconds before collapsing into the empty state. Measured on
  an empty account: loading state, then the empty state, with the board never
  becoming visible.
- **Landing page mock cards carry the real company logos.** The preview cards
  name Stripe, Vercel, Linear and Framer, so they now show those icons instead of
  the lettered placeholder the real cards fall back to when a logo lookup fails. The four marks are static 128×128 files under
  `public/landing-logos/`, chosen deliberately over a favicon lookup: the landing
  page is statically built, and a runtime service call would put a third party in
  the path of the first page every visitor sees. `ApplicationCardView` takes an
  optional `logoUrl` and `CompanyAvatar` an optional `srcOverride`, which bypasses
  the `/logos/:id` route — the mock data has no application id to look a logo up
  by. Real cards are untouched.
- **Card metadata is always two lines.** "Last round: …" and "Updated …" were a
  wrapping row, so they shared a line on wide cards and split on narrow ones —
  the same card read differently at different widths. They are a column now.
- **The dashboard has no toolbar while the account is empty.** With nothing in
  it there is nothing to search, nothing to sort, no second view to switch to,
  and "Add application" is already the empty state's own button — so search,
  sort, the view switch and that button all stay out of the way, in both the
  board and the list. The email-verification banner stays away for the same
  reason — one focus on the screen, and a limit only starts to matter once there
  is something to add. (The donation banner needs no gate: it hides itself until
  there are offers.) The rule lives in `useAccountIsEmpty`, deliberately two
  counts that must agree: `applicationCount` (the server's snapshot, so nothing
  flashes in before the empty state) and the shared stats query (live,
  invalidated by every mutation, so all of it returns the moment the first
  application is added — but it excludes archived applications, so it cannot be
  trusted alone). A search that matches nothing is not this state and keeps its
  controls, since hiding them would leave no way to clear the filter. Covered by
  `tests/e2e/empty-board.spec.ts`.

### Performance
- **The dashboard opens with one board request instead of six.** Each column
  used to fetch its own first page and its own count; `GET
  /api/applications/board` answers all of them at once (one partitioned query
  with the totals riding along, plus one milestones query for every card), and
  `useBoardSeed` writes each section straight into the cache entry its column
  reads. The write happens inside the query function, before the seed resolves:
  a section mounts the moment the seed is ready, so filling the cache in an
  effect afterwards would have sent every column off on its own request in the
  gap. Measured on the dashboard: **11 API calls → 6** (1 board + 1 stats + 4
  session in dev), and the six per-section `count(*)` queries are gone with the
  six requests. `load more` still uses the per-status endpoint, and a section
  cannot tell which one filled it — `tests/integration/board-equivalence.test.ts`
  checks the two agree section by section. Failing is safe: the sections are only
  gated while the seed is in flight, so an error drops back to exactly the old
  behaviour, six requests and all.
- **Milestone shifts and renumbering are one statement each.** Adding, deleting
  or re-marking a step used to move the following rows with one `UPDATE` per row
  inside the transaction — a five-step timeline meant up to five round-trips. The
  shifts are now single range updates (`step_order ± 1` over the affected range)
  and the done-before-pending renumbering is one `CASE`. That is safe as a single
  pass because nothing unique-constrains `(application_id, step_order)`, so a row
  may pass through another row's old position mid-statement.
  `tests/integration/milestone-ordering.test.ts` pins the invariants that make the
  rewrite equivalent — the order stays a gapless `0..n-1`, and done steps always
  precede pending ones — rather than asserting the SQL.
- **The list endpoint sends only what a card renders.** `ApplicationListItem` was
  the whole `applications` row plus derived fields, so every board load
  serialized `notes`, the three contact fields, `userId`, `createdAt` and
  `archivedFromStatus` — none of which a card reads, because the detail page
  fetches the full row through `getApplication`. The list query now selects the
  thirteen fields a card uses, and the milestone rows it joins select the three
  the progress maths needs. Measured on a 22-application board: **12,344 →
  7,703 bytes** across the six per-status requests, −38%. The type was declared
  in two places (`lib/api.ts` and the service) and had already drifted apart; the
  service owns it now and `lib/api.ts` re-exports it.
- **The landing page no longer ships the dashboard's card runtime.** The product
  mock on the marketing page rendered `ApplicationCardView` — a client component
  carrying date-fns relative timestamps, Radix Progress and Radix Avatar — for
  four decorative cards, and so pulled all three onto the page a stranger loads
  first. The markup now lives in `ApplicationCardShell`, a server component, and
  `ApplicationCardView` wraps it with only the pieces that genuinely need the
  client. Measured on the landing route's chunk list: **382 kB → 325 kB** of JS
  (date-fns 10 kB, Radix Progress 4 kB and the avatar chunk all gone), and the
  mock bars gained the `aria-valuenow` the Radix ones never rendered. The four
  cards' text, card classes, fill transform and segment hairlines are identical
  before and after, checked against the previous production build — it is the
  same markup, not a copy that will drift.
- **The dashboard's stat counts are computed in the database.** `getStats` used
  to fetch every application the user owns — one row each, on every dashboard
  load and after every mutation, since the client invalidates it — and tally them
  in JavaScript. It is one aggregate with `FILTER` clauses now. Counting in SQL
  meant expressing the ghosted rule there as well, and that is where a real bug
  surfaced: the first version counted only applied/interviewing rows that had gone
  quiet, so an application filed as ghosted *by hand* was missing from the card
  while sitting in the ghosted column — the number above the column read 8 over a
  column of 9. Both sides now compare against one shared `ghostedCutoff(days)`;
  letting SQL compare against the database's own `now()` would put the two clocks
  either side of an application sitting exactly on the threshold.
  `tests/integration/stats-ghosted-rule.test.ts` holds the two implementations to
  the same answer, covering both kinds of ghosted and the boundary itself.
- **Independent database reads now run concurrently.** The dashboard page's
  user row and application count, the list query's `count(*)` and its page of
  rows, `getApplication`'s patience lookup and milestones, and `getStats`' rows
  and patience lookup were each awaited one after the other for no reason — they
  depend on the same inputs and on nothing else, and the service contained no
  `Promise.all` at all. The list case matters most: it runs once per board
  column, so six round-trips per dashboard load became six saved ones.
- **Analytics is loaded after hydration.** Umami was a bare `<script defer>` in
  `<head>`, opening a third-party connection while the page's own JS and fonts
  were still competing for bandwidth. It is `next/script` with
  `strategy="afterInteractive"` now, and nothing on the page waits on it.
- **Static pages no longer ship the auth and query runtime.** `SessionProvider`,
  `QueryClientProvider` and the cache-clearer lived in the root layout, so the
  landing page and the legal pages — no session, no queries — hydrated both and
  fetched `/api/auth/session` on every visit, crawlers included. They now live in
  `AppProviders`, mounted by the `(dashboard)` and `(auth)` groups, with one
  QueryClient per mount so crossing that boundary starts a clean cache. Measured
  on `/privacy`: 111 kB → 101 kB of JS, and two session requests → none.
- **Moving a card refreshes the columns it could have changed, not all six.** A
  plain status change knows both ends, and a stale application is displayed in
  "applied"/"interviewing" *and* in "ghosted", so a move now invalidates exactly
  those sections (the ones the optimistic detach proved the card was in, plus its
  destination) instead of the whole `["applications"]` prefix — four fewer
  requests and roughly a dozen fewer queries per drag. Mutations whose effect on
  status the client cannot predict (a step-back re-derives the status from the
  timeline) deliberately keep invalidating everything. Creating an application
  narrows to its own section the same way.

### Fixed
- **Resetting the timeline stops at the application.** Dragging a card back from
  Interviewing to Applied and choosing "reset the timeline" cleared every step, so
  an application sitting in Applied read as though it had never been sent and its
  progress was 0% for a process that had at least started. The first step — titled
  "Application", the step that status is derived from — stays done now, and
  everything after it returns to pending with its date cleared. Progress reads one
  step rather than none. `tests/integration/reset-timeline.test.ts` pins it, and
  the API test that asserted the old full wipe was updated.
- **The archived progress bar is readable.** Its track was `bg-zinc-200/60`,
  which on the card's own muted grey was very nearly the same colour — the bar
  looked broken rather than empty — and the segment separators were `bg-card`, a
  hard-coded white hairline that only looked like a gap while cards were white.
  The archived track is a couple of steps darker than its card (measured:
  card `rgb(223,223,226)`, track `rgb(161,161,170)`, fill `rgb(82,82,91)`), and
  the separators are a translucent hairline that reads as a divider on any tint.
- **The archived card is the same colour in both views.** Its tint was
  `bg-muted/60`, the only translucent one in light mode — every other status is
  opaque — and a translucent tint is only the same colour if the surface behind it
  is. Over the board's white column it read white-ish, over the dashboard's grey
  page it read grey, so the same application looked like two different cards.
  Measured: card `rgba(223,223,226,0.6)` over `rgb(255,255,255)` versus over
  `rgb(233,233,236)`; now an opaque `rgb(223,223,226)` in both. (Dark mode's tints
  are all translucent by design, but there both surfaces are dark and close, so
  the effect is not visible.)
- **The archived card's colours and progress bar were missing.** Not the card's
  logic: its colours compiled to nothing. The per-status card colours live in
  `lib/utils/card-styles.ts`, and Tailwind's `content` globs listed `./pages`,
  `./components` and `./app` but not `./lib`, so any class named only there was
  absent from the stylesheet. The card tint survived by luck (`bg-muted/60` is
  used elsewhere), while the archived progress bar's own `bg-zinc-200/60` and
  `bg-zinc-400` existed nowhere else and rendered fully transparent; the archived
  border fell back to the default grey, which is why the card also read
  differently in the two views. `./lib/**` is scanned now. Measured before and
  after on both views: track `rgba(0,0,0,0)` → `rgba(228,228,231,0.6)`, fill
  transparent → `rgb(161,161,170)`, border default grey →
  `rgba(212,212,216,0.7)`, and the list and board colours now match.
- **The dashboard no longer opens narrow and jumps to the board's width.** The
  shell is widened by a rule keyed on `data-view="board"` (six columns need the
  room), and that attribute was set in a `useEffect` — so the first paint was
  always list-width and the whole page reflowed about half a second later, once
  hydration had run. Measured: `main` 1024 px → 1280 px and the column strip
  992 px → 1248 px, both at ~500 ms. The attribute is now set by the inline
  script in the root layout that already decides the theme before first paint, so
  the shell is right in the first frame; `Dashboard` keeps it in sync from then
  on, and only starts touching it once it has read the stored preference (a list
  user's shell must not flash to board width on the way to "list" — verified: it
  stays 1024 px from the first frame).
- **The board's toolbar no longer jumps into the header.** It used to render
  inline and then remount inside `#dashboard-header-slot` once the viewport width
  and the slot were known — measured at ~460 ms, with the search, sort, view
  switch and Add button visibly relocating upward. Both facts are
  browser-only, so the toolbar is simply not rendered until they are resolved:
  one appearance, in its final place.
- **The board's loading state is keyboard accessible.** The column strip scrolls
  sideways, which makes it a scrollable region, and while it holds only skeletons
  nothing inside it can take focus — `scrollable-region-focusable` (WCAG 2.1.1)
  failed on the loading state and passed once the cards arrived, which is why it
  showed up intermittently as a "flake" on a cold server. The region itself is a
  tab stop now (`role="region"`, `aria-label`, `tabIndex=0`, focus ring), so a
  keyboard user can arrow across the columns and the audit passes in both states
  — confirmed by running it against the same cold server that had just failed.
- **The board's horizontal scrollbar no longer dominates the cards.** The column
  strip scrolls sideways on purpose — the columns snap past each other — but a
  desktop browser reserves a full-height bar for it, drawn right under the cards,
  which is what looked wrong at narrower widths. It is now a slim themed
  hairline (`scrollbar-width: thin` plus a `::-webkit-scrollbar` thumb in the
  app's border colour on a transparent track). Measured in the reporting browser:
  **15 px reserved → 10 px**, still scrollable, columns unchanged. It stays
  visible deliberately: it is the only hint a mouse user gets that there are more
  columns to the right.
- **Dismissing the verification banner no longer breaks hydration.** The "Later"
  dismissal was read straight out of localStorage in a `useState` initialiser,
  so in any browser where the banner had been dismissed the client's first
  render omitted a banner the server had already rendered. Every sibling after
  it shifted by one node, and React reported the desync wherever it looked next
  — in practice the search icon inside `ApplicationList`, as "Expected server
  HTML to contain a matching `<svg>` in `<div>`", followed by "Hydration failed
  because the initial UI does not match what was rendered on the server". It
  happened on every load in that browser, survived a hard reload, and never
  appeared in a fresh profile, which is what made it look like it came from
  somewhere else. The stored dismissal is now applied in an effect, after mount,
  exactly as the board/list view preference already was.
  `tests/e2e/hydration.spec.ts` reproduces the original failure and guards it:
  it fails on the old code and passes on the new.
- **Tapping a form field on an iPhone no longer zooms the page.** iOS Safari
  zooms whenever a focused text control's font size is under 16px, and every
  control in the app is `text-sm` (14px), so the layout jumped into a zoomed
  state the user had to pinch back out of. The controls are raised to 16px
  instead of the viewport being locked: `maximum-scale=1` would have removed
  pinch-zoom for everyone (WCAG 1.4.4), and 16px is the accessible minimum for
  form text anyway. The rule is scoped to `(hover: none) and (pointer: coarse)`
  so the desktop design keeps its 14px labels, and it exempts checkboxes, radios
  and range sliders, which never trigger the zoom. It needs `!important`:
  Tailwind v3 emits utilities unlayered, so a single class outranks a bare type
  selector — without it the `input`s moved to 16px while the milestone dialog's
  `textarea` and `select` stayed at 14px, leaving the bug alive in the fields
  nobody tested. `tests/e2e/mobile-zoom.spec.ts` now holds the invariant at a
  phone viewport across login, register, the dashboard and that dialog.

## 2026-09-17

### Fixed
- **"Ghosted" is a real status now.** It existed only as a time-derived
  overlay, so the edit form offered it and the API rejected the payload. It is
  in the status enum (`0008`), a user-owned state alongside rejected and
  archived, and the board's Ghosted column accepts drops. The clock still runs:
  an applied or interviewing application that goes quiet past the patience
  window is shown as ghosted, and filtering by ghosted returns both the
  hand-filed ones and the silent ones.

### Changed
- **Application details page reworked.** The progress bar is gone — the timeline
  already says where the application stands. "Add milestone" moved from a button
  above the timeline into the timeline itself, as its last entry — a bordered
  secondary button with the + in it — behind a dashed connector. Milestones open
  **in place, like an accordion** (title, status, date, comment, save/cancel and
  delete inline) instead of a modal thrown over the timeline; the row itself is
  the header, with `aria-expanded`/`aria-controls`, and only one is open at a
  time. The next step still to do opens by default, so the page lands on the
  thing you came to fill in; once you pick a row yourself (or save), it stops
  moving under you. The Details card is read-only now (label/value rows, links for the
  posting, website, email and phone, "—" for anything unset) and editing happens
  in a modal, so the page no longer looks like a settings screen. The card sizes
  to its own content — it used to stretch down to match the timeline's height —
  and carries one kebab menu (edit, favourite, archive/reopen) in its header,
  replacing the star and menu that sat in the page header plus the duplicate
  Edit button that was on the card.
- **The role field autocompletes from roles you have used before**, most
  recently used first (`GET /api/applications/roles`). The suggestion list is
  the app's own popover surface (`bg-popover`, `shadow-md`, `bg-accent` for the
  active row) with full keyboard support — a native `<datalist>` was tried first
  and is drawn by the browser with OS chrome, ignoring the app's tokens. Used in
  the add and edit modals.
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
