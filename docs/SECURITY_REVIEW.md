# Ghosted — Security & Code Review Report (multi-model, verified)

**Date:** 2026-08-27
**Repo:** `/home/k/Code/unomas`
**Scope:** Next.js 14 (App Router) + Drizzle ORM + PostgreSQL + Auth.js v5 (`next-auth@5.0.0-beta.32`, JWT sessions) + bcryptjs + TanStack Query + Zod v4 + pino + Resend. Dockerfile + railway.json deployment.

This report consolidates four independent AI code reviews, every finding **verified against the actual source code** before being included. Reviews were run via direct OpenRouter API calls (all billed to the project's key) against the full source bundle (573 KB / 121 files).

| Model | Model ID | Findings | Accurate | Complete | Cost |
|---|---|---|---|---|---|
| GLM 5.2 | `z-ai/glm-5.2` | 16 | ~16/16 | ✅ 13.9K tokens | $0.33 |
| Qwen 3 Coder Plus | `qwen/qwen3-coder-plus` | 10 | ~3/10 | ❌ stopped early ×2 | $0.81 |
| Qwen 3 Coder Next | `qwen/qwen3-coder-next` | 9 | ~2/9 | ❌ stopped early | $0.04 |
| Qwen 3.7 Max | `qwen/qwen3.7-max` | 10 | 8/10 | ✅ 6.9K tokens | $0.35 |
| DeepSeek 4 Pro | `deepseek/deepseek-v4-pro` | 9 | 8/9 | ✅ 5.1K tokens | $0.35 |

Raw outputs: `.tmp-review/glm52_review.md`, `.tmp-review/qwen_next_review.md`, `.tmp-review/qwen37_review.md`, `.tmp-review/ds4_review.md`.

---

## Verified findings

Findings marked ✅ were confirmed by reading the actual code; ⚠️ indicates partial accuracy or disagreement between models; ❌ indicates the claim was tested and found false (kept here as a record of model reliability, not as an action item).

### 🔴 Critical

1. **OAuth account takeover via unverified email linking** — `lib/auth.ts:80-95` ✅
   The OAuth find-or-create path rebinds an existing account to the OAuth identity by email alone, **without checking `emailVerified`**, and marks it `emailVerified: true`. Attack scenario: attacker registers victim's email (unverified), victim later signs in with Google/LinkedIn → attacker's account gains victim's OAuth identity and verified status. Worse: `authorize()` (credentials) looks up by email and checks `passwordHash` only — it never checks `provider` — so the attacker **retains password access** even after the victim links their real OAuth identity.
   *Found by:* GLM 5.2 (correct severity + mechanics), DeepSeek 4 Pro (saw it but rated LOW and misdescribed it as "locking out password login" — wrong direction). Qwen 3.7 Max declared "no criticals" and missed it.
   *Fix:* Only link when the existing account's email is verified; otherwise create a separate OAuth account or require email verification before linking.

2. **Rate-limiter bypass via spoofed `X-Forwarded-For`** — `lib/utils/rate-limit.ts:44-48` ✅
   `getClientIp` trusts the first entry of the client-supplied `X-Forwarded-For` header (and `x-real-ip`). An attacker rotates the header per request → fresh bucket every time → brute-force / email-bomb throttling on login/register/forgot-password is defeated.
   *Found by:* GLM 5.2, Qwen 3.7 Max, DeepSeek 4 Pro.
   *Fix:* Only trust an IP header set by a trusted proxy; add per-account/per-email throttle as a header-independent second layer.

### 🟠 High

3. **Production Docker image runs as root** — `Dockerfile` ✅
   No `USER` directive; the app container runs as root.
   *Found by:* GLM 5.2, Qwen 3.7 Max, DeepSeek 4 Pro.
   *Fix:* Add `USER node` (or a dedicated unprivileged user).

4. **Production image ships devDependencies** — `Dockerfile` ✅
   Runner copies full `node_modules` (includes playwright, vitest, drizzle-kit, eslint, tsx).
   *Found by:* GLM 5.2, Qwen 3 Coder Next.
   *Fix:* `pnpm install --prod` / `pnpm deploy` in runner, or `output: 'standalone'`.

5. **Missing HSTS header** — `next.config.mjs` ✅
   `securityHeaders` includes X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / CSP but **no `Strict-Transport-Security`**, on an HTTPS-only deploy.
   *Found by:* GLM 5.2, DeepSeek 4 Pro, Qwen 3 Coder Next.
   *Fix:* Add `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.

6. **`EMAIL_FROM` defaults to Resend test domain** — `lib/emails.ts:33` ✅
   Falls back to `onboarding@resend.dev`, which produces low deliverability / test-branded emails in production.
   *Found by:* DeepSeek 4 Pro.
   *Fix:* Fail fast (or log loudly) in production when unset.

7. **Registration race returns 500 instead of 409** — `app/api/auth/register/route.ts` ✅
   Check-then-insert without handling Postgres unique-violation (23505).
   *Found by:* GLM 5.2, Qwen 3.7 Max, DeepSeek 4 Pro.
   *Fix:* Catch 23505 → `EMAIL_TAKEN` 409.

### 🟡 Medium

8. **Absolute session cap is ineffective** — `lib/auth.ts` ⚠️
   The jwt callback pins `token.exp = iat + 7d`, but Auth.js `@auth/core`'s `encode()` (verified in installed source `@auth/core@0.41.3`, `jwt.js`) calls `.setIssuedAt().setExpirationTime(now() + maxAge)` which **unconditionally overwrites** `iat`/`exp` on every session refresh. Result: sessions slide indefinitely (up to the 30-day idle `maxAge`); the documented 7-day absolute cap never applies. Qwen 3.7 Max claimed the opposite (cookie outlives JWT → 401s) — verified false.
   *Fix:* Enforce the absolute cap inside the jwt callback (return null when `now - iat > cap`), which makes Auth.js clear the session.

9. **Rate limiter is in-memory, shared per-IP bucket, counts successes** — `lib/utils/rate-limit.ts` ✅
   Buckets reset on restart and are per-instance (replicas diverge); all six auth endpoints share one per-IP bucket; successful logins consume quota.
   *Found by:* GLM 5.2, Qwen 3.7 Max, DeepSeek 4 Pro.
   *Fix:* Per-endpoint + per-account keys; don't count successful requests; shared store for multi-instance.

10. **Missing `AUTH_URL` with `trustHost: true`** — `lib/auth.ts:26` ✅
    Base URL / secure-cookie decision derived from request `X-Forwarded-Host` / `X-Forwarded-Proto`.
    *Fix:* Set `AUTH_URL` to the canonical HTTPS origin in production.

11. **Silent email failure in production** — `lib/emails.ts` ✅
    `sendEmail` logs and swallows errors when `RESEND_API_KEY` is missing; verification/reset emails silently never arrive.
    *Fix:* Throw/log loudly in production.

12. **UPDATEs missing `userId` in WHERE clause** — `lib/services/applications.ts` ⚠️
    `reopenApplication`, `toggleFavorite`, etc. verify ownership via a SELECT but the subsequent UPDATE only filters by id — a defense-in-depth gap (not currently exploitable since the SELECT gates it).
    *Fix:* Include `userId` in the UPDATE WHERE.

13. **Manual archive via PATCH loses `archivedFromStatus`** — `lib/utils/status.ts` / `lib/services/applications.ts` ⚠️
    Direct `status: 'archived'` set skips `archivedFromStatus`; reopen then restores to "applied" instead of the archived status. Also, `deriveStatus` preserves only rejected/archived, so a manually set 'offer' is clobbered by the next milestone change.
    *Fix:* Compute derived status server-side; preserve manual 'offer'.

14. **CSP includes `unsafe-inline` / `unsafe-eval`** — `next.config.mjs` ⚠️
    Required for the inline no-flash theme script and some tooling; softens XSS defense.
    *Fix:* Hash the inline script, drop `unsafe-eval` in production.

15. **Dev-only text leaks into production forgot-password form** — `app/(auth)/login/forgot-password-form.tsx` ⚠️
    Shows "link printed to server log" text that is only accurate in dev.
    *Fix:* Gate dev text behind `NODE_ENV`/`AUTH_DEBUG`.

16. **No rate limiting on data endpoints** — `app/api/applications/route.ts` etc. ⚠️
    Application create/update, milestones, profile PATCH, export are unthrottled.
    *Fix:* Per-user write limits.

### 🟢 Low / accepted

17. Verification token in URL query string — acceptable for MVP; consider POST body or short-lived token later.
18. Email PII in plaintext logs (`logger.info`) — GDPR consideration.
19. Placeholder legal pages (`/privacy`, `/terms`) — fine pre-launch.
20. `NEXT_PUBLIC_APP_URL` silently falls back to `http://localhost:3000` — fail fast in production.
21. Email-preview page uses literal placeholder `token=0xVERIFY0x` — dev-only, protected by `NODE_ENV`.
22. Verification tokens not all invalidated on use (only the redeemed token gets `usedAt`) — low impact; consider purging on use.
23. Migration runner races on multi-replica startup — run migrations single-instance (or with a lock).
24. No uniqueness on `(application_id, step_order)` — concurrent milestone writes can transiently duplicate sort keys.

---

## Model reliability notes

- **GLM 5.2** was the most accurate: every finding verified, correct severities, caught the OAuth takeover with correct mechanics and the session-cap invalidation (confirmed against `@auth/core` source).
- **Qwen 3 Coder Plus / Coder Next** both stopped early (947/1,270 completion tokens vs GLM's 13,953) and fabricated multiple file/line citations that failed verification (5 of 9 false for Coder Next: token logging, SSRF, preview token, reset reuse, debug logging). Not suitable for unverified audit use.
- **Qwen 3.7 Max** produced a complete, mostly accurate review (8/10) but declared "no criticals", missing the OAuth takeover, and got the session-cap mechanics backwards.
- **DeepSeek 4 Pro** was complete and accurate (8/9) but under-rated the OAuth takeover (LOW) and misdescribed its consequence.

**Fix ordering (launch blockers first):** 1 → 2 → 3/4 → 5 → 6 → 7 → 8 → 10 → 11.

---

## Fix status (applied 2026-08-27)

All launch-blocking and most medium findings are **fixed and verified** (`tsc` clean, 145/145 tests pass, `next lint` clean, production `next build` succeeds). Model-independent verification notes included.

| # | Finding | Status | Notes |
|---|---------|--------|-------|
| 1 | OAuth account takeover | ✅ Fixed | `lib/auth.ts` — link only when the existing account's email is verified; unverified squatted accounts are adopted for the verified OAuth identity **and their `passwordHash` is cleared** so the squatter loses password access permanently. |
| 2 | Rate-limiter bypass | ✅ Fixed | `lib/utils/rate-limit.ts` — `getClientIp` now trusts the **last** entry of `x-forwarded-for` (the trusted proxy's append), plus a header-independent per-account throttle (`rateLimitAccount`). |
| 3 | Docker runs as root | ✅ Fixed | `Dockerfile` — added `USER node` + `chown -R node:node /app`. |
| 4 | Dev deps in prod image | ✅ Fixed | `Dockerfile` — `RUN pnpm prune --prod` in the runner stage. (Not buildable in the sandbox — no Docker; validated by inspection.) |
| 5 | Missing HSTS | ✅ Fixed | `next.config.mjs` — `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. |
| 6 | `EMAIL_FROM` test domain | ✅ Fixed | `lib/emails.ts` — production throws loudly when `EMAIL_FROM` or `RESEND_API_KEY` is unset instead of silently using the test domain/stub. |
| 7 | Registration 500 on race | ✅ Fixed | `app/api/auth/register/route.ts` — catches unique-violation `23505` → 409 `EMAIL_TAKEN`. |
| 8 | Session cap ineffective | ✅ Fixed | `lib/auth.ts` — verified against `@auth/core@0.41.3` source that `encode()` re-signs `iat`/`exp` on every request, so an `exp` pin never fires. Enforced via a custom `authTime` claim: jwt callback returns `null` past 7 days → Auth.js clears the session. |
| 9 | Limiter shared bucket / counts successes | ✅ Fixed | Per-`scope` keys per endpoint; `rateLimitSuccess()` resets the window after successful login/register/reset/change-password; per-account throttle added to login/register/forgot-password/resend-verification. |
| 10 | Missing `AUTH_URL` | ✅ Fixed | `lib/auth.ts` — in production, `AUTH_URL` is derived from `NEXT_PUBLIC_APP_URL` (when an https origin) so the base URL never comes from spoofable `x-forwarded-host` headers; logs an error if neither is a valid https URL. |
| 11 | Silent email failure | ✅ Fixed | see #6 — production throws on missing `RESEND_API_KEY`. |
| 12 | UPDATEs missing `userId` | ✅ Fixed | `lib/services/applications.ts` — `reopenApplication` and `toggleFavorite` now include `userId` in the UPDATE WHERE clause. |
| 13 | Archive/reopen status + manual 'offer' | ✅ Fixed | Direct PATCH archive now stores `archivedFromStatus` (`updateApplication`); `MANUAL_STATUSES` includes `'offer'` so a manually set offer survives milestone changes. |
| 14 | CSP `unsafe-eval` in prod | ✅ Fixed | `next.config.mjs` — `script-src` drops `'unsafe-eval'` when `NODE_ENV=production` (dev-only requirement). |
| 15 | Dev text in forgot-password form | ✅ Fixed | Gated behind `NODE_ENV !== "production"`. |
| — | Open redirect via `callbackUrl` | ✅ Fixed | `login-form.tsx` — only same-origin relative paths accepted (rejects `//evil.com` and absolute URLs). |
| 16 | No rate limit on data endpoints | ⏳ Deferred | Per-user write limits on applications/milestones/export — larger surface; suggested next. |
| 17-24 | Low items | ⏳ Deferred | See review; acceptable pre-launch (tokens in query string, email PII logs, legal pages, token purge, migration lock, step_order unique index). |

**Remaining recommended before public launch:** #16 (per-user write rate limits) and setting `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`, `RESEND_API_KEY` in production env.

**Verification:** `tsc --noEmit` ✅ · `vitest run` 145/145 ✅ (2 tests updated to reflect intended new behavior: manual 'offer' status, per-account throttle) · `next lint` ✅ · `NODE_ENV=production next build` ✅. Docker image build could not run in the sandbox (read-only `/home/k/.docker`); Dockerfile verified by inspection.
