# Architecture

## Tech Stack

| Layer          | Choice                                             |
| -------------- | -------------------------------------------------- |
| Language       | TypeScript (strict)                                |
| Framework      | Next.js 14 (App Router, RSC + client components)   |
| ORM            | Drizzle + drizzle-kit (committed SQL migrations, no auto-sync in prod) |
| Database       | PostgreSQL 16 (local Docker; Neon/Supabase-ready)  |
| Auth           | Auth.js v5 (email/password + Google/LinkedIn OAuth, stubbed) |
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
  ApplicationCard / ApplicationList / AddApplicationModal
  MilestoneTimeline / AddMilestoneModal / EditApplicationForm
  Dashboard / DashboardStats / DonateBanner
lib/
  auth.ts                 # Auth.js v5 config (JWT, bcrypt, OAuth stubs)
  api.ts                  # typed client-side API + error handling
  db/                     # Drizzle schema + client
  services/applications.ts# transactional business logic (the core)
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
5. **Ghosted**: an application in `applied|interviewing` untouched for
   `GHOSTED_AFTER_DAYS` (default 14) is shown as ghosted - a display overlay,
   not a stored status.

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
- **Multi-replica migrations**: `scripts/migrate-on-start.mjs` takes a
  Postgres advisory lock so only one container migrates during rolling
  deploys.
