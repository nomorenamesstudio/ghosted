# Contributing

Ghosted is a solo-built project that is happy to take contributions. This file
exists so that a patch arrives in a shape that can be merged, not so that it
arrives at all.

## Getting it running

```bash
git clone https://github.com/krisztianhadi/ghosted && cd ghosted
pnpm install
docker compose up -d          # Postgres only, for development
cp .env.example .env          # then set AUTH_SECRET: openssl rand -base64 32
pnpm db:create-test && pnpm db:migrate
DATABASE_URL="$TEST_DATABASE_URL" pnpm db:migrate   # the test database too
pnpm dev                      # http://localhost:3000
```

Sign up through the UI on the dev instance. Emails are printed to the server log
(`EMAIL_TRANSPORT=log`), so you can follow a verification or reset link without a
mail provider.

## Before you open a pull request

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

All four run in CI, plus a job that builds the container image and boots the
compose stack. A red build is not a stylistic problem — the image job exists
because a broken Dockerfile once shipped unnoticed.

## What gets merged

- **Behaviour changes need a test that would fail without them.** The suite is
  the specification; a fix without a regression test is a fix that comes back.
- **Tests must protect something observable** — a contract, an invariant, a
  failure mode. A test that re-asserts source code or restates an implementation
  detail is not one; see `docs/ARCHITECTURE.md` for how the existing ones are
  chosen.
- **Small diffs.** One concern per pull request; the commit history is read.
- **US spelling** in code, comments, docs and UI copy (color, favorite, gray,
  center, normalize). UK spellings exist in older comments and are being fixed as
  files are touched.
- **Accessibility and the design language are shipping gates**: reuse the
  existing components rather than inventing one, and keyboard/contrast behaviour
  is verified by the e2e suite.

## Scope

Good candidates: bug fixes, accessibility, performance, documentation, broader
browser coverage, translations.

Out of scope without a discussion first: new runtime dependencies (the project
is deliberately dependency-light — the SMTP client is hand-written for this
reason), a redesign of the board/list UI, and anything that requires a hosted
service to self-host.

## Security

Do not open a public issue for a vulnerability — see [SECURITY.md](SECURITY.md).

## Licence

Contributions are accepted under the MIT licence, the same as the project.
