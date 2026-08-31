# Ghosted - For the Job Hunters

A personal job-application tracking webapp. Log applications, track progress
through a 5-step default timeline (extendable), and view a lightweight
dashboard with stats - and never lose track of the applications that went
quiet on you (ghosted).

## Documentation

- [Setup & run](docs/SETUP.md) - install, env vars, commands, testing, CI/CD
- [API reference](docs/API.md) - all endpoints, parameters, examples
- [Architecture](docs/ARCHITECTURE.md) - tech stack, data flow, key decisions
- [Changelog](docs/CHANGELOG.md) - changes by date and type
- [Security review](docs/SECURITY_REVIEW.md) - multi-model audit report

## Tech Stack

| Layer          | Choice                                             |
| -------------- | -------------------------------------------------- |
| Framework      | Next.js 14 (App Router)                            |
| ORM            | Drizzle + drizzle-kit (SQL migrations, no auto-sync in prod) |
| Database       | PostgreSQL 16 (local Docker; Neon/Supabase-ready)  |
| Auth           | Auth.js v5 (email/password + Google OAuth; LinkedIn when configured) |
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
```

> Note: in this sandbox environment port 3000 is occupied by a system nginx,
> so e2e tests run the app on port 3100 (see `playwright.config.ts`).

Full environment variable reference: see `.env.example` and
[docs/SETUP.md](docs/SETUP.md).

## Features

- Application CRUD with a 5-step default timeline (extendable)
- Milestone progress auto-advances the status: `applied -> interviewing ->
  offer`; `rejected` / `archived` / `offer` are manual terminal states
- Dashboard stats (total / active / interviewing / offers / rejected /
  ghosted)
- Search, status filter, sort, pagination, infinite scroll, sticky section
  headers, reversible archive, favourites pinned to the top
- Email/password auth (bcrypt) + optional Google/LinkedIn OAuth, email
  verification, password reset, GDPR export + account deletion
- Unverified accounts are limited to 3 applications until their email is
  verified (env-configurable)
- Night mode (system default + manual override), responsive UI

## MVP Scope

**Included:** full CRUD for applications, milestone timeline (add/update/delete
with reordering + per-row menus), 5-step default + extra steps, progress bar,
dashboard stats, search + filter + sort, reversible archive, OAuth +
email/password auth, user menu with night mode, responsive UI.

**Explicitly out (v2 candidates):** job-description auto-fetch from URL,
email notifications, public profiles/sharing, calendar integrations,
CSV import/export.

## License

See [Imprint / legal templates](docs/ARCHITECTURE.md) notes (complete before
going live).
