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
