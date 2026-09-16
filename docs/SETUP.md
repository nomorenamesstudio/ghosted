# Setup

## Prerequisites

- Node.js v22+ (pnpm 11 requires Node 22.5+ for `node:sqlite`)
- pnpm 10.12.1 (project-pinned; install via `npm install -g pnpm@10.12.1`)
- PostgreSQL 16 (local Docker image provided by `docker compose`)

## Install

```bash
git clone git@github.com:krisztianhadi/ghosted.git
cd ghosted
pnpm install
```

## Database

```bash
# Start Postgres and create the test database
docker compose up -d
pnpm db:create-test

# Apply migrations to dev + test databases
pnpm db:migrate
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate
```

Never `pnpm db:push` in production - production migrations run automatically
on deploy (`scripts/migrate-on-start.mjs`, advisory-locked).

## Environment

```bash
cp .env.example .env
```

### Database

| Variable | Description |
| -------- | ----------- |
| `DATABASE_URL` | Main Postgres connection string |
| `DATABASE_URL_REPLICA` | Optional read-only replica (analytics) |
| `TEST_DATABASE_URL` | Test DB for Vitest + Playwright |

### Auth

| Variable | Description |
| -------- | ----------- |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | Canonical public origin; REQUIRED (https) in production - Auth.js derives its base URL from this, never from request headers |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Optional - enables the Google button |
| `AUTH_LINKEDIN_ID` / `AUTH_LINKEDIN_SECRET` | Optional - enables the LinkedIn button |

### App

| Variable | Description |
| -------- | ----------- |
| `NODE_ENV` | `production` \| `development` |
| `NEXT_PUBLIC_APP_URL` | Public origin; REQUIRED (https) in production - used in emailed links |
| `NEXT_PUBLIC_DONATE_URL` | Coffee/donate link (banner + user menu) |

### Security

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `RATE_LIMIT_MAX` | 5 | Max attempts per IP per window |
| `RATE_LIMIT_WINDOW_MINUTES` | 15 | Rate-limit window |
| `RATE_LIMIT_WRITES_MAX` | 300 | Max authenticated writes per user per window |
| `RATE_LIMIT_WRITES_WINDOW_MINUTES` | 60 | Write-limit window |
| `UNVERIFIED_APP_LIMIT` | 3 | Max applications for unverified accounts (server-enforced) |
| `PASSWORD_RESET_TTL_MINUTES` | 60 | Reset token lifetime |
| `GHOSTED_AFTER_DAYS` | 14 | Fallback only: the ghosted threshold is per user now (Settings → Patience level: 14/10/7 days, default realistic) |

### Email (Resend)

| Variable | Description |
| -------- | ----------- |
| `RESEND_API_KEY` | REQUIRED in production; without it dev logs a stub, production fails loudly |
| `EMAIL_FROM` | Verified sender on your Resend domain; REQUIRED in production |
| `EMAIL_VERIFICATION_TTL_MINUTES` | Default 1440 (24h) |

## Run

```bash
pnpm dev            # http://localhost:3000 (JSON logs)
pnpm dev:pretty     # same, piped through pino-pretty
```

Note: in the development sandbox port 3000 is occupied by a system nginx, so
e2e tests run the app on port 3100 (see `playwright.config.ts`).

Optional demo data:

```bash
pnpm db:seed   # demo@example.com / password123 (additive, 16 samples)
```

## Testing

```bash
pnpm test         # unit + integration (Vitest, needs Postgres + TEST_DATABASE_URL)
pnpm test:e2e     # Playwright critical paths (starts the app on :3100)
```

- Unit: progress/reorder/status edge cases, Zod schemas, component render.
- Integration: route handlers against real Postgres with a mocked session -
  auth guards, CRUD, pagination, reordering, status derivation, stats, rate
  limiting, password lifecycle, XSS sanitization, cross-user isolation.
- E2E: register/create/milestone/detail, stats, search/filter, delete, auth
  redirect, stress (220 applications lazy-load), a11y (axe).

## CI/CD

`.github/workflows/ci.yml` runs on PRs to `main` and pushes:

1. Lint + typecheck (`pnpm lint`, `tsc --noEmit`)
2. Unit + integration tests against a Postgres service container
3. Playwright e2e (Chromium with system deps; report uploaded on failure)

Production deployment is Railway: push to `main` triggers a Docker build
(`Dockerfile`) and auto-deploy with migrations run on container start.
