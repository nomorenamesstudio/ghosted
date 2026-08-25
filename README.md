# Ghosted — For the Job Hunters

A personal job-application tracking webapp. Log applications, track progress
through a 5-step default timeline (extendable), and view a lightweight
dashboard with stats — and never lose track of the applications that went
quiet on you (ghosted).

Built from a full technical specification — see
[Spec decisions & definitions](#spec-decisions--definitions) for how ambiguous
points were resolved.

## Tech Stack

| Layer          | Choice                                             |
| -------------- | -------------------------------------------------- |
| Framework      | Next.js 14 (App Router)                            |
| ORM            | Drizzle + drizzle-kit (SQL migrations, no auto-sync in prod) |
| Database       | PostgreSQL 16 (local Docker; Neon/Supabase-ready)  |
| Auth           | Auth.js v5 (email/password + Google/LinkedIn OAuth, stubbed) |
| UI             | shadcn/ui-style components + Tailwind CSS          |
| Client state   | TanStack Query (caching + optimistic updates)      |
| Validation     | Zod v4                                             |
| Logging        | pino (structured JSON)                             |
| Testing        | Vitest + React Testing Library + Playwright        |

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres and create the test database
docker compose up -d
pnpm db:create-test

# 3. Configure environment
cp .env.example .env
#    - set AUTH_SECRET (openssl rand -base64 32)
#    - optionally set TEST_DATABASE_URL

# 4. Apply migrations (dev + test databases)
pnpm db:migrate
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate

# 5. Run the dev server
pnpm dev            # http://localhost:3000  (JSON logs)
pnpm dev:pretty     # same, piped through pino-pretty

# 6. (Optional) seed demo data
pnpm db:seed        # demo@example.com / password123
#    Seeds 16 sample applications across all statuses (offer / interviewing /
#    applied / rejected / archived, one stale >14d to light up the "Ghosted"
#    card) with contacts, notes and varied milestone progress. Additive:
#    re-running only adds samples that don't already exist (company + role).
```

> Note: in this sandbox environment port 3000 is occupied by a system nginx,
> so e2e tests run the app on port 3100 (see `playwright.config.ts`).

## Environment Variables

See `.env.example` for the full annotated list:

```
DATABASE_URL=            # main Postgres connection string
DATABASE_URL_REPLICA=    # optional read-only replica for analytics
TEST_DATABASE_URL=       # used by Vitest integration tests and Playwright
AUTH_SECRET=             # openssl rand -base64 32
AUTH_GOOGLE_ID/SECRET=   # optional – enables the Google button
AUTH_LINKEDIN_ID/SECRET= # optional – enables the LinkedIn button
NODE_ENV=                # production | development
NEXT_PUBLIC_APP_URL=     # used in password-reset links
RATE_LIMIT_MAX=          # default 5
RATE_LIMIT_WINDOW_MINUTES= # default 15
PASSWORD_RESET_TTL_MINUTES= # default 60
RESEND_API_KEY=          # transactional email (verification, resets); unset → log stub
EMAIL_FROM=              # e.g. "Ghosted <noreply@yourdomain.com>"
EMAIL_VERIFICATION_TTL_MINUTES= # default 1440 (24h)
```

## Project Structure

```
app/
  (auth)/                 # login, register, forgot/reset password
  (dashboard)/            # protected shell: stats + list + application detail + settings
  api/
    applications/         # GET (list w/ filters) + POST
    applications/[id]/    # GET / PATCH / DELETE (soft)
    applications/[id]/milestones/  # POST (insert w/ reorder)
    milestones/[id]/      # PATCH / DELETE (reorder)
    dashboard/stats/      # GET
    auth/                 # [...nextauth], login, register, forgot/reset-password
components/
  ui/                     # shadcn-style primitives (button, dialog, card, dropdown, …)
  UserMenu / theme-provider / StatusBadge
  ApplicationCard / ApplicationList / AddApplicationModal
  MilestoneTimeline / AddMilestoneModal / EditApplicationForm
  Dashboard / DashboardStats
lib/
  auth.ts                 # Auth.js v5 config (JWT, bcrypt, OAuth stubs)
  api.ts                  # typed client-side API + error handling
  db/                     # Drizzle schema + client
  services/applications.ts# transactional business logic (the core)
  utils/                  # progress, reorder, status, sanitize, validation,
                          # rate-limit, api error helpers, logger
scripts/                  # create-test-db, seed
tests/
  unit/                   # progress, reorder, validation, status
  integration/            # route-handler tests against real Postgres
  component/              # RTL render tests
  e2e/                    # Playwright critical paths
drizzle/                  # committed SQL migrations
```

## API

All routes are under `/api/`, require an authenticated session, scope every
query to `session.user.id`, and validate input with Zod. Errors always use the
shape `{ "error": string, "code": string, "details"?: unknown }`.

| Method | Path                                | Description                                        |
| ------ | ----------------------------------- | -------------------------------------------------- |
| GET    | `/applications`                     | List (search, status filter, sort, pagination)     |
| POST   | `/applications`                     | Create (company, role, url? + default timeline)    |
| GET    | `/applications/:id`                 | Single app + milestones                            |
| PATCH  | `/applications/:id`                 | Update fields / status                             |
| DELETE | `/applications/:id`                 | Soft delete (→ archived)                           |
| POST   | `/applications/:id/reopen`          | Restore an archived app to its previous status     |
| POST   | `/applications/:id/favorite`        | Toggle favourite (pinned to the top of lists)      |
| POST   | `/applications/:id/milestones`      | Add milestone (insert at position, reorder)        |
| PATCH  | `/milestones/:id`                   | Update title/status/comment/date                   |
| DELETE | `/milestones/:id`                   | Remove milestone, reorder rest                     |
| GET    | `/dashboard/stats`                  | total / active / interviewing / offers / rejected / ghosted |
| POST   | `/api/auth/login`                   | Email+password sign-in (rate limited)              |
| POST   | `/api/auth/register`                | Create account (rate limited, auto sign-in)        |
| POST   | `/api/auth/forgot-password`         | Issue 1h reset token (no account enumeration)      |
| POST   | `/api/auth/reset-password`          | Redeem token, change password                      |
| GET    | `/api/auth/verify-email`            | Confirm an email address via the emailed token     |
| POST   | `/api/auth/resend-verification`     | (Re)send the verification email (signed-in)        |
| PATCH  | `/api/auth/profile`                 | Update name / email (409 on duplicates)            |
| POST   | `/api/auth/change-password`         | Change password (current password required)        |
| DELETE | `/api/auth/account`                 | GDPR erasure — permanently delete account + data   |
| GET    | `/api/auth/export`                  | GDPR portability — download all data as JSON       |

**List filters:** `status`, `search` (company/role, case-insensitive partial),
`sort` (`company | status | updated_at`, default `updated_at desc`),
`page` & `limit` (default `1` / `20`, max 100).

## Spec Decisions & Definitions

Points the spec left ambiguous, and how this implementation resolves them:

- **Schema gap**: `contact` was replaced by three structured columns —
  `contact_name`, `contact_email`, `contact_phone` (the detail view renders
  three inputs).
- **Status is auto-derived from milestones** (your choice): completing
  milestones advances `applied → interviewing → offer`.
  - `rejected` and `archived` are manual terminal states; milestone changes
    never overwrite them.
  - Rule (done-count based): **all** milestones `done` → `offer`; **2+**
    milestones `done` → `interviewing`; otherwise `applied`. Skipped steps do
    not count. This pairs with the timeline invariant below — positional
    rules would be unstable.
  - You can still set status manually via PATCH (e.g. mark `rejected`); the
    next milestone change recomputes it unless the status is manual.
- **Timeline stays "done first"**: marking a milestone done out of order
  reorganizes the steps so done milestones always come before pending ones
  (stable within each group). This is enforced on status changes.
- **Progress**: `offer`/`rejected` → 100%. Otherwise
  `round(doneCount / totalSteps * 100)`, doneCount capped at `totalSteps`.
  `totalSteps` always equals the current milestone count (min 1), so inserting
  a step at any position grows the denominator.
- **Ghosted** (your choice, one threshold): an application whose status is
  `applied | interviewing` **and** `updated_at` is older than 14 days is
  shown as **ghosted** (default `GHOSTED_AFTER_DAYS=14`, env-configurable).
  It is a *display* overlay — the stored status stays `applied|interviewing`,
  so any edit or milestone change refreshes `updated_at` and revives the
  application automatically. `offer` / `rejected` / `archived` are never
  ghosted.
- **Stats**: `total` counts non-archived applications (consistent with the
  default list view); `active` = applied + interviewing (excluding ghosted);
  `interviewing`, `offers`, `rejected` by status; `ghosted` counts stale
  applied/interviewing; archived apps count nowhere.
- **Favourites**: a star button on the detail page toggles `is_favorite`;
  favourited applications are pinned to the top of every list/section (all
  sort modes) and get a small star indicator on their card.
- **Status cards**: muted accent borders on the dashboard cards — soft green
  for offers, soft red for rejected, soft purple for ghosted.
- **Soft delete**: DELETE sets `status = 'archived'`. Archived apps are hidden
  from the default list and from every stat, but remain in the database and
  are visible via the `status=archived` filter.
- **Insert milestone at position n**: shift `step_order >= n` up by 1, insert
  at `n` (positions beyond the end are clamped to append). Delete shifts
  `step_order > deleted` down by 1, keeping the sequence dense 0..n-1.
- **"Current round"** on list cards = title of the highest-`step_order` done
  milestone, falling back to the first milestone's title.
- **Archive is reversible**: the "…" menu on the detail page offers
  *Archive* (soft delete → hidden from list/stats) and, when archived,
  *Reopen*. Reopen restores the exact status the application had before
  archiving (stored in `archived_from_status`, including manual states like
  `rejected`). Both the application and each milestone row use a "…" popover
  menu for their actions; there is no hard delete.
- **Milestone dates**: marking a milestone *done* records today's date
  automatically; the milestone *Edit* dialog defaults an unset date to today
  and the date is always editable afterwards.
- **Night mode**: defaults to the user's system preference
  (`prefers-color-scheme`), with a manual override (user menu or /settings)
  persisted in localStorage.
- **Details save/cancel**: the detail-page details block shows **Save** and
  **Cancel** buttons at the bottom, only after a change has been made
  (Cancel reverts to the saved values).
- **Dashboard is sectioned by status**: the list groups applications into
  Offers / Interviewing / Applied / Ghosted / Rejected (and Archived, when
  filtered) sections with icons; empty sections are hidden. Search and the
  status/sort dropdowns filter across sections (the list fetches up to 100
  rows — pagination was dropped in favor of the grouped view; the API still
  supports it).
- **Status icons** (lucide) appear on status badges, stats cards, section
  headers, and inside every status dropdown.
- **Modals animate from the center** (fade + scale, no corner slide).
- **Legal footer**: a footer with "Made with ❤ by Lost Signals Studio" and
  links to public static pages — Privacy Policy (GDPR), Terms of Service and
  Imprint. These are templates: complete the bracketed operator details
  (address, contact, jurisdiction) before going live.
- **Profile & GDPR**: the Settings page covers appearance, profile (name,
  email — synced into the session JWT via a session update), password change
  (rate limited, current password required), **data export** (JSON download,
  Art. 20 portability) and **account deletion** (Art. 17 erasure — cascades
  to all applications/milestones).
- **Email & verification**: transactional emails (verification, password
  reset) go through Resend when `RESEND_API_KEY` is set — otherwise they are
  logged as a dev stub (tests always force the stub). Email accounts start
  unverified and get a `/verify-email` link; the Settings page shows the
  verified status with a resend option; changing the email resets
  verification. OAuth accounts are verified by their provider.
- **Auth**: email/password with bcrypt (salt rounds 12); JWT sessions with a
  30-day idle TTL hard-capped at 7 days absolute (JWT `exp` pinned to
  `iat + 7d`). Google/LinkedIn providers are only registered when their env
  vars are set — buttons are hidden otherwise (stubbed in dev).
- **Password reset** is stubbed for the MVP: the reset link (containing a
  random 64-char token, stored as a SHA-256 hash) is printed to the server
  log instead of emailed. Tokens expire after 1 hour and are single-use.
- **Rate limiting** (5 attempts / 15 min / IP) uses an in-memory sliding
  window — fine for a single-user app, but it resets on restart and does not
  scale horizontally; back it with Redis for production multi-instance.
- **CSP**: `default-src 'self'` with `'unsafe-inline'`/`'unsafe-eval'` for
  scripts (required by the Next.js runtime); tighten for production if you
  don't use Next dev tools. No shadcn CDN is used.

## Security

- Every API route calls `requireSession()` and filters all queries by
  `user_id`; cross-user access returns 404 (no existence leak).
- Zod validates every endpoint; URLs must be `http(s)` (no `javascript:` /
  `data:`); free-text fields are sanitized (whole `<script>` elements removed)
  on input, and React escapes on render (defense in depth).
- Headers via `next.config.mjs`: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  CSP, `Permissions-Policy`.
- Errors never leak stack traces in production (`NODE_ENV=production`);
  DB-unavailable maps to 503 with `Retry-After`, rate-limit to 429.
- Migrations run only via `drizzle-kit migrate`; prepared statements by default
  (postgres-js). Never `db:push` in production.
- Pre-launch audit checklist is in the spec — the automated parts are covered
  by the test suite (auth guards, cross-user isolation, XSS sanitization,
  SQL-injection via parameterized search).

## Testing

```bash
pnpm test                 # unit + integration (Vitest, needs Postgres + TEST_DATABASE_URL)
pnpm test:e2e             # Playwright critical paths (starts the app on :3100)
```

- **Unit** (Vitest + RTL): `progress.ts` edge cases, `reorder.ts` insert/delete
  shifts, `status.ts` auto-advance + needs-action, Zod schemas, one component
  render test.
- **Integration** (Vitest, real Postgres): route handlers with a mocked Auth.js
  session — auth guards (401), CRUD, filtering/pagination, milestone
  reordering, auto-advance, manual-status override, soft delete, stats,
  rate limiting, password reset lifecycle, XSS sanitization, cross-user 404s.
- **E2E** (Playwright): ① register → create app → add milestone → detail,
  ② stats update after milestone-driven status change, ③ search/filter results,
  ④ delete → app no longer visible, ⑤ register/sign-out/login + auth redirect.

## CI/CD

`.github/workflows/ci.yml` runs on PRs to `main` and pushes:

1. **Lint & typecheck** (`pnpm lint`, `tsc --noEmit`)
2. **Unit + integration tests** against a Postgres service container
3. **Playwright e2e** (Chromium installed with system deps; report artifact
   uploaded on failure)

Deployment itself is out of scope for this MVP — wire a green-build deploy
(e.g. Vercel/Neon) on top of the same workflow.

## MVP Scope

**Included:** full CRUD for applications, milestone timeline (add/update/delete
with reordering + per-row menus), 5-step default + extra steps, progress bar,
dashboard stats, search + filter + sort, reversible archive, OAuth +
email/password auth, user menu with night mode, responsive UI.

**Explicitly out (v2 candidates):** job-description auto-fetch from URL,
email notifications, public profiles/sharing, calendar integrations,
CSV import/export.
