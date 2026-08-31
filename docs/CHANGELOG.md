# Changelog

All notable changes, by date and type.

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
