# Architecture

## Tech Stack

| Layer          | Choice                                             |
| -------------- | -------------------------------------------------- |
| Language       | TypeScript (strict)                                |
| Framework      | Next.js 14 (App Router, RSC + client components)   |
| ORM            | Drizzle + drizzle-kit (committed SQL migrations, no auto-sync in prod) |
| Database       | PostgreSQL 16 (local Docker; Neon/Supabase-ready)  |
| Auth           | Auth.js v5 (email/password + Google OAuth; LinkedIn when configured) |
| UI             | shadcn/ui-style components + Tailwind CSS          |
| Client state   | TanStack Query (caching + optimistic updates)      |
| Validation     | Zod v4                                             |
| Logging        | pino (structured JSON)                             |
| Testing        | Vitest + React Testing Library + Playwright        |
| Deploy         | Railway (Dockerfile, multi-stage)                  |

## Project Structure

```
app/
  page.tsx                # public landing page (/) - signed-in users → /app
  logos/[id]/route.ts     # company logo bytes (cacheable, outside /api)
  avatars/[hash]/route.ts # gravatar bytes (cacheable, outside /api)
  (auth)/                 # login, register, forgot/reset password, verify email
  (dashboard)/            # protected shell: stats + list + detail + settings
  api/
    applications/         # GET (list w/ filters) + POST
    applications/[id]/    # GET / PATCH / DELETE (soft) / reopen / favorite
    applications/[id]/milestones/  # POST (insert w/ reorder)
    milestones/[id]/      # PATCH / DELETE (reorder)
    dashboard/stats/      # GET
    auth/                 # [...nextauth], login, register, forgot/reset-password,
                          # verify-email, resend-verification, profile,
                          # change-password, account, export
components/
  ui/                     # shadcn-style primitives (button, dialog, card, ...)
  UserMenu / theme-provider / StatusBadge / VerificationBanner / VerificationModal
  ApplicationCard / ApplicationList / AddApplicationModal / CompanyAvatar
  KanbanBoard / KanbanColumn / KanbanCard / StepBackDialog / use-application-section
  MilestoneTimeline / AddMilestoneModal / EditApplicationForm
  Dashboard / DashboardStats / DonateBanner
lib/
  auth.ts                 # Auth.js v5 config (JWT, bcrypt, Google/LinkedIn OAuth)
  api.ts                  # typed client-side API + error handling
  db/                     # Drizzle schema + client
  services/applications.ts# transactional business logic (the core)
  services/company-logos.ts# logo cache-aside (DB + favicon services)
  services/gravatar.ts    # gravatar lookup, asked once at sign-in
  utils/                  # progress, reorder, status, sanitize, validation,
                          # rate-limit, api error helpers, logger
scripts/                  # create-test-db, seed, migrate-on-start
tests/
  unit/                   # progress, reorder, validation, status
  integration/            # route-handler tests against real Postgres
  component/              # RTL render tests
  e2e/                    # Playwright critical paths
drizzle/                  # committed SQL migrations
middleware.ts             # Cache-Control: no-store on all /api/*
```

## Data Flow

1. **Auth**: login/register issue a JWT session cookie (30-day idle TTL,
   hard-capped at 7 days absolute via an `authTime` claim). The session
   exposes `id`, `email`, `emailVerified`.
2. **Requests**: every API route calls `requireSession()`, reads
   `session.user.id`, and scopes every query by `user_id`. Server pages
   (`/app`, `/settings`) read `emailVerified` straight from the DB so the
   verification UI is never stale.
3. **Client**: TanStack Query caches list/stats/milestone data; mutations use
   optimistic updates + invalidation. On login, register, or sign-out the
   query cache is purged explicitly (the QueryClient survives client-side
   navigation, so this is the only reliable place to clear it).
4. **Status derivation**: application status is computed from milestone
   progress unless the status is a manual terminal state (`rejected`,
   `archived`, `offer`). All milestones done -> offer; 2+ done ->
   interviewing; otherwise applied.
5. **`updated_at` moves only when the state does**: status changes (including
   archive and reopen) and timeline changes (add/edit/delete a milestone, reset
   the timeline) refresh it; descriptive edits — company, role, job URL, company
   website, contacts, notes — deliberately do not, so bookkeeping cannot fake
   progress. It drives the ghosted clock, the "Updated …" line and the
   last-updated sort, and because it no longer moves on a website edit, that
   field is part of the company-logo cache key instead.
6. **Ghosted is two things at once**: a status the user can set by hand (in
   `MANUAL_STATUSES`, so a milestone edit cannot re-derive it away) and a
   display overlay the clock applies to `applied|interviewing` applications that
   go quiet past the patience window. The `ghosted` filter returns both, and
   `applied`/`interviewing` exclude the silent ones so a card never shows in two
   columns.
7. **Ghosted (the clock)**: an application in `applied|interviewing` untouched for longer
   than the user's **patience level** (Settings: generous 14 / realistic 10 /
   impatient 7 days, default realistic) is shown as ghosted - a display
   overlay, not a stored status. `GHOSTED_AFTER_DAYS` remains only as the
   fallback for code without a user in hand.

## Key Decisions

- **Status auto-derived from milestones**: completing milestones advances
  `applied → interviewing → offer`. `rejected`/`archived`/`offer` are manual
  terminal states and are never overwritten by milestone changes.
- **Timeline stays "done first"**: marking a milestone done out of order
  reorganizes steps so done milestones precede pending ones (stable within
  each group).
- **Progress**: `offer`/`rejected` -> 100%; otherwise
  `round(doneCount / totalSteps * 100)`. `totalSteps` always equals the
  current milestone count (min 1), so inserting a step grows the denominator.
- **Soft delete**: DELETE sets `status = 'archived'` and records
  `archivedFromStatus`; reopen restores the exact previous status. There is
  no hard delete in the UI.
- **Step ordering**: `step_order` is kept dense 0..n-1. Concurrent milestone
  writes serialize on the application row (`SELECT ... FOR UPDATE`) so
  reorder shifts cannot collide.
- **Session cap enforced in the jwt callback**: `@auth/core` re-signs the JWT
  on every request and overwrites `iat`/`exp`, so a custom `authTime` claim
  (checked in the callback) enforces the 7-day absolute cap instead.
- **Unverified accounts are capped**: `UNVERIFIED_APP_LIMIT` (default 3)
  applications, enforced server-side (403 `EMAIL_UNVERIFIED_LIMIT`) and
  surfaced in the UI via a banner + modal.
- **Email verification**: email accounts start unverified; changing the email
  resets verification. OAuth accounts are verified by their provider.
- **Rate limiting**: in-memory sliding window per IP + per account, with
  per-endpoint scopes and success-reset. Fine for a single-user app; back it
  with Redis for horizontal scaling.
- **CSP**: `default-src 'self'`, prod `script-src 'self' 'unsafe-inline'`
  (inline theme script; no eval in prod), `connect-src 'self'`. See
  `next.config.mjs`.
- **One data hook behind both list and board**: `use-application-section.ts`
  owns a status group's query, pagination, merge and scroll sentinel; the list
  sections and the kanban columns are both thin renderers over it. They
  therefore share query keys, so switching views reuses the cache instead of
  refetching, and a mutation (including a drag between columns) updates both.
  The merge always truncates the accumulated tail to what the server still
  reports - without that, an application moved out of a group left a stale
  duplicate behind, which is how it was found.
- **Kanban drag uses the native HTML5 API, not a drag library**: the wrapper
  around each card is `draggable` (with `draggable={false}` on the inner link,
  which would otherwise hijack the drag) and each column is a drop target. The
  drag payload carries `company\0id\0fromStatus`, because the receiving column
  only knows the target — the source status is what distinguishes a step back
  from ordinary progress. The card also carries a "Move to" menu, which is the
  touch and keyboard route — native HTML5 drag does not exist on touch, and this
  keeps the dependency list unchanged. `ghosted` is a derived display state, so
  that column refuses drops; dropping into `archived` goes through the same
  PATCH status path that records `archivedFromStatus`, so Reopen still restores
  the previous status.
- **A step back is a question, not a rewrite**: moving a card backwards through
  `PIPELINE_ORDER` (applied → interviewing → offer) opens `StepBackDialog`
  before anything is written. Which question is asked comes from
  `stepBackKind()`: from `offer` it offers to record the round that happened
  (append a milestone), from `interviewing` to `applied` it offers to reset the
  timeline (`POST .../milestones/reset` — every step back to pending, dates
  cleared, status re-derived). Both variants also offer a tertiary "leave it as
  is, but move", which is a plain status PATCH. Confirming rewrites the timeline
  *first* and PATCHes the status last, because the timeline calls re-derive the
  status. Cancelling writes nothing at all — which is why the card is never
  optimistically moved for a step back: it stays in its column while the dialog
  is open.
- **The board owns the page width, and the view lives in Dashboard**: which view
  is active has to be known above `ApplicationList`, because the stat cards and
  the shell width depend on it. `Dashboard` sets
  `document.documentElement.dataset.view = "board"` and a rule in `globals.css`
  widens `.app-shell` (header + main), which keeps the layout a server
  component. The stored preference is read in an effect after mount — reading
  localStorage during the first render is a hydration mismatch.
- **Multi-replica migrations**: `scripts/migrate-on-start.mjs` takes a
  Postgres advisory lock so only one container migrates during rolling
  deploys.
- **Company logos are cached in Postgres, not object storage**: favicons are
  1-15KB, so `company_logos` (bytes as base64 text - Drizzle has no `bytea`)
  adds no second dependency to the render path and inherits the normal
  database backups. The swap point, should uploaded files ever need real
  object storage, is `lib/services/company-logos.ts` alone; a Railway
  storage bucket (private, S3-compatible) would replace that module without
  touching the route or the card. Note that buckets are private-only, so the
  same-origin `/logos/:id` route stays either way.
- **Logos are looked up by domain, never by the stored URL**: the only URL we
  hold is the *job posting* URL, and a favicon from `linkedin.com` or
  `boards.greenhouse.io` is the board's logo, not the employer's. Candidates
  are derived in `lib/utils/company-domain.ts`, in order of trustworthiness:
  the application's explicit `companyWebsite` (normalised on write) -> posting
  host -> parent domain -> board subdomain/path slug -> single-word company
  name. A slug guess can land on an unrelated company (`Acme` -> the real
  `acme.com`), which is exactly why the explicit field exists and comes first.
  Only the resulting domain is ever sent to a favicon service, so a
  user-supplied URL cannot steer a server-side fetch (no SSRF surface).
- **Email/password users get a Gravatar, resolved once at sign-in — and only
  if one exists**: `d=404` makes Gravatar answer 404 instead of substituting a
  placeholder, so a user without an account keeps the initials fallback the
  menu already renders. The lookup runs in the `jwt` callback guarded by
  `account?.provider === "credentials"`, because that callback also fires on
  every session read and must stay network-free; the answer then rides in the
  session as `user.image` (Auth.js maps `token.picture` → `session.user.image`).
  Consequently there is no `users.image` column: the picture — Google's or
  Gravatar's — exists only inside the JWT, exactly as it did before.
- **Gravatar bytes are proxied through `/avatars/:hash`, not hotlinked**:
  Gravatar's own `Cache-Control` is `max-age=300`, so a hotlinked avatar makes
  every browser re-ask them every five minutes. The proxy re-serves the same
  bytes with `private, max-age=604800, stale-while-revalidate=86400`, misses
  with `private, max-age=3600`. The route sits outside `/api` for the same
  reason `/logos/:id` does — middleware forces `no-store` on that whole prefix —
  and re-validates the upstream body (status, raster-only content type, 512KB
  cap) rather than trusting the status code, since an HTML error page cached as
  an image is worse than no avatar at all.

## Performance notes

Measured on a production build (`next build` + `next start` in a throwaway copy —
never against the dev server's `.next`), 22 applications, 1440×900.

**Read the per-route JS column with care.** Repeated runs of the *same* code
differ by up to ~38 kB on that number (async chunks and timing), so it is only
useful for order-of-magnitude checks. The numbers worth trusting are the ones
traced to a source: a request count, a response size, a chunk list from the build
manifest, or a query count from the code.

| route | requests | notes |
| --- | --- | --- |
| `/` landing (signed out) | 26 | session request gone (was 2); build manifest chunk total for the route 325 kB raw, was 382 kB |
| `/login` (signed out) | 29 | mounts `AppProviders` |
| `/app` (signed in) | 77 | 2 session + 6 per-status lists + 1 stats + 22 logos — the fan-out is unchanged and is the biggest win still on the table |
| `/privacy` (static) | — | 101 kB of JS, no session request (was 111 kB + 2) |

What the refactor actually changed, each traced to a measurement:

| change | evidence |
| --- | --- |
| static pages no longer load the auth/query runtime | `/privacy`: two `/api/auth/session` requests → none |
| independent reads run concurrently | 4 call sites serialized → parallel (dashboard page, list count/page, app+milestones, stats rows+patience) |
| per-section counts folded into the page query | 26 → 20 queries per dashboard load (6 sections × 1 count removed) |
| list payload narrowed to the card's fields | 12,344 → 7,703 bytes for a full board load (−38%), shape pinned by `tests/integration/list-payload.test.ts` |
| landing mock cards render without the client card | route chunk list 382 → 325 kB raw (date-fns, Radix Progress, avatar chunk) |
| move/create invalidate only the affected columns | 6 → 2–3 section refetches per drag |
| stats counted in SQL | one aggregate instead of one row per application per load and per mutation |
| milestone shifts and renumbering | one statement per operation instead of one `UPDATE` per moved row |

One more decision worth keeping: **the application card has one shell, shared by
the dashboard and the landing page.** `ApplicationCardShell` is a server
component holding the markup and the per-status colour tokens (now in
`lib/utils/card-styles.ts`, since a server component cannot import values from a
client one); `ApplicationCardView` wraps it with the client-only pieces — live
relative timestamp, Radix avatar, Radix progress — and the landing passes a plain
`<img>` and a static bar. That is what keeps the four decorative mock cards from
pulling date-fns and two Radix primitives onto the first page a stranger loads,
without a copied card that would drift.

Decisions worth keeping:

- **`AppProviders` is mounted per route group, not in the root layout.**
  `SessionProvider`, `QueryClientProvider` and `SessionCacheClearer` belong to
  `(dashboard)` and `(auth)` only; the root layout keeps `ThemeProvider`, since
  the inline script already applies the theme before paint and the settings page
  still needs its context. One QueryClient per mount means crossing the
  auth/dashboard boundary starts a clean cache — the isolation
  `SessionCacheClearer` gives between users, for free, between the groups.
- **Invalidation is narrowed where the affected columns are known and left broad
  where they are not.** A plain move knows both ends, and the optimistic detach
  proves which sections held the card (a stale application is displayed in both
  "applied" and "ghosted"), so it refreshes those plus the destination. A
  step-back rewrites the timeline and lets the server re-derive the status, so it
  invalidates the whole `["applications"]` prefix deliberately.
- **The list query carries its own total**: `count(*) over ()` is evaluated
  before LIMIT, so one query returns the page and how many matched. Only an empty
  page *past the first* — rows vanishing between requests — runs a real count,
  because otherwise a section header would claim "0 applications" over nothing.
- **Independent reads run concurrently.** The patience lookup gates a WHERE
  clause; everything else in a request (`count`/rows, app/milestones, stats rows)
  goes out together.

Deliberately not done, with the measurement that settled it:

- **Moving the board toolbar out of its portal** (the review's "one extra render"
  item). Measured in a browser on a wide-screen dashboard load: the toolbar
  mounts inline, then mounts again into `#dashboard-header-slot` ~460 ms later
  (dev timing; hydration is what the gap waits on). The cost is not the CPU — it
  is that the search, sort, view switch and "Add application" button visibly
  relocate from above the board into the header once the effect resolves. Nothing
  cheap removes that: the slot only exists client-side, resolving it during the
  first render is a hydration mismatch (the window width and the slot element are
  both unknowable on the server), and `position: fixed` would detach the controls
  from the layout that sizes them. It is a design decision — render the toolbar
  in the header from the start, or keep it in the content flow like the list view
  does — not a performance one, so it stays as it is until someone wants it
  changed.
- **Dynamic-importing the modals** (the review's "no `next/dynamic`" finding):
  the dashboard's page chunk is 34 kB raw and the modals are a slice of it, so
  lazy-mounting six dialogs — each needing first-open state to keep Radix's exit
  animations — buys roughly 3 kB gzipped. Not worth the complexity.
- **One board endpoint instead of six per-status requests** is the real win still
  on the table (~18 queries per dashboard load), but it means redesigning the
  per-column paging contract `useApplicationSection` and the infinite scroll are
  built on, plus the "every column has reported in" logic behind the empty state.
  It wants its own session rather than a tail-end change.
- **The list carries only what a card renders.** `ApplicationListItem` is the
  thirteen fields the card uses — not the whole row — and the milestones joined
  into it are narrowed to the three the progress maths reads. On a board of 22
  applications that took the six per-status responses from 12.3 kB to 7.7 kB.
  The type lives in the service beside the query that produces it and is
  re-exported by `lib/api.ts`; declaring it in both places is how it drifted once.
- **Milestone ordering is rewritten in one statement per operation.** A shift is
  a range update (`step_order ± 1` where the order crosses the insert or delete
  point), and the done-before-pending renumbering is a single `CASE`. Both rely on
  there being no unique constraint on `(application_id, step_order)`: with one,
  rows swapping places would collide mid-statement. `lib/utils/reorder.ts` keeps
  the pure helpers as the readable statement of the rules, and
  `tests/integration/milestone-ordering.test.ts` checks the invariants (gapless
  `0..n-1`, done before pending) rather than the SQL.
