# Security audit — 2026-10-14 (static, source-only)

**Run status: incomplete.** Coverage is partial by construction, not by failure: the
approved budget funded 8 hunter units and 17 verifications, and the critic's six
additional units plus two platform units are recorded as `deferred` in the coverage
ledger with their reasons. No target code was executed: this pass produced source
traces and, where a verifier could isolate a dependency, a bounded measurement of
that dependency alone. Every verdict is therefore `needs_validation` or `rejected` —
nothing here is called `confirmed`, and nothing should be described that way.

## Fix order, across all three passes

Ordered by what unblocks most, not by pass. Every line is reproducible from the
findings details; each carries the failing behaviour it removes.

**Now**

1. **`lib/utils/rate-limit.ts:62-67` — the doubled unit conversion.** Move the
   `* 60_000` so it applies only to the minutes-valued env default; a caller-supplied
   `windowMs` is already milliseconds. This is live and needs no account: today ~101
   unauthenticated failures put every account's correct password out of action until a
   restart, and the per-user write throttle is 300 writes per 2,500 days. Pin it with
   fake timers — the existing cap test never advances a clock, which is why a
   60,000× window passed CI. **Do not ship it alone** (see the condition below).
2. **`app/api/auth/profile/route.ts:11` with `lib/services/account.ts:46-74` — prove the
   password before an email change, and notify the old address.** As shipped, an email
   change needs only a session, which makes the current-password gate on account
   deletion effectively optional (email change → `forgot-password` to the new address →
   reset → delete). Reuse the existing `verifyPassword` helper; add the `sessionEpoch`
   bump as defence in depth only, since the attacker keeps the mailbox.
3. **`lib/email/log.ts:26-29` — stop logging live credentials.** The whole message body,
   reset and verification tokens included, goes to stdout at `info` while the database
   stores only the hash. Redact the token out of the logged body and bound log
   retention.
4. **`lib/services/account.ts:284-296` (`verifyEmail`) — make the write conditional.**
   The address check and the write are separate statements and the `UPDATE` matches only
   `id`, so an email change committing between them verifies the new address.
   `WHERE id = ? AND email = ?`, or one transaction.
5. **`app/api/auth/login/route.ts:29` — assert `Content-Type: application/json`** (or
   require the token Auth.js's own credentials callback demands). A cross-site
   text/plain form post otherwise mints a session in the victim's browser.
6. **`app/api/auth/forgot-password/route.ts:91` — defer the send with `after()`.** The
   hit path awaits a mail round trip while the miss path does not, which is a
   membership oracle the docs promise does not exist.

**Then**

7. **`app/api/auth/change-password/route.ts:22` and `:40`, and
   `set-password/route.ts:41`** — add a per-user counter beside the per-IP one, and stop
   clearing a shared per-IP bucket on a per-account success. `docs/API.md:19` promises
   limits "per IP and per user"; these two routes have only the IP half.
8. **Documentation honesty sweep** — `API.md:19` and `:185` (limits that do not exist);
   the boot refusal (`assertDeployable` is dead code, with `.env.example:98`,
   `SELFHOST.md:81-82` and the changelog all promising the app refuses to boot — either
   wire `instrumentation.ts` or correct the claim); `docker-compose.yml:86`
   (`${EMAIL_TRANSPORT:-}`, or fix the three documents that promise auto-detection);
   `lib/utils/csrf.ts:7-8` on `signOut`; `SECURITY.md:81-84` (the per-account window
   admits 6 failures, not 5); and the stale comment at
   `app/api/auth/account/route.ts:27` about a same-site foothold.
9. **`lib/services/company-logos.ts`** — a row cap or eviction; the table grows
   monotonically from client-supplied domains.
10. **`lib/email/smtp.ts`** — a wall-clock deadline on the conversation plus buffer and
    continuation-line caps, and a warning when `SMTP_ALLOW_INSECURE` is set alongside
    credentials or a non-loopback host.

## Landed, 2026-10-15

The "Now" block of the fix order is shipped, each item with a test that was
watched to fail without it (all five go red when the fix is reverted):

1. **The doubled unit conversion, with the prune condition.** `windowMs` is
   milliseconds everywhere, the env default is converted once, and the overflow
   prune never evicts a window that is still refusing. Shipped as `1.4.1` and
   measured on the deployed staging build: 240 failures through the callback
   path, then one sign-in attempt answered `429` with `Retry-After: 833` — the
   remainder of a 15-minute window, where the same probe returned 54,000,000
   seconds before the fix.
2. **The email change.** The current password is required when the address
   actually changes, the old address receives a notice naming the new one, and a
   provider-only account — which has no password to prove — still moves with the
   session alone. The gate runs before the duplicate-address check, so a
   passwordless session cannot enumerate registered addresses through it either.
   The `sessionEpoch` bump the record suggested as defence in depth is
   deliberately **not** included: the password proof is the gate, an attacker
   holding the password can re-authenticate after any bump, and the bump would
   sign the account holder out of every device for their own legitimate change.
3. **The log transport redacts tokens outside development**, where the log is
   retained by the platform. Development keeps the clickable link, which is the
   documented workflow. Retention itself remains the host's.
4. **`verifyEmail` writes conditionally** (`WHERE id AND email`), so the check and
   the write are one statement. Untested by interleaving — no seam exists to
   commit an email change between them — so this one is closed structurally
   rather than pinned by a test.
5. **`login` and `register` require `application/json`** (`415` otherwise), which
   closes the login-CSRF route; a form cannot send that media type without a
   preflight.
6. **`forgot-password` defers the send** to `after()`, so the hit path no longer
   takes a mail round trip the miss path does not. `after()` throws outside a
   request scope, so a directly-driven handler falls back to an unawaited send —
   which is what the latency test exercises.

Also fixed from the doc-honesty item: the peek that guards the Credentials
callback refused while `count > max` and therefore admitted a sixth attempt where
five were documented. It refuses at a spent window now, so the per-account limit
is the five `SECURITY.md` describes.

**Landed later the same day — the "Then" block, all four:**

7. **Per-user counters on both password routes.** `change-password` and
   `set-password` now carry an account window beside the per-IP one, and a
   success clears only the account's own window: clearing the shared per-IP
   bucket had handed the allowance back to everyone behind that address. The
   `docs/API.md` promise of "per IP and per user" is now what the code does.
8. **The documentation-honesty sweep.** `assertDeployable` is deleted (dead
   code, no caller, no `instrumentation.ts`), and `.env.example` plus
   `SELFHOST.md` now describe what the app actually does: a coherent-but-
   unusable production deployment is *reported* (`/api/health` 503
   `config: invalid`, which the compose healthcheck turns unhealthy) and sign-ups
   are refused with 503 `MAIL_NOT_CONFIGURED`, while a malformed flag *value*
   still stops the boot. `docker-compose.yml` passes `${EMAIL_TRANSPORT:-}` so an
   unset value falls through to auto-detection as three documents promise; the
   stale CSRF comment (sign-out) and the deletion route's comment are corrected.
9. **The logo cache is bounded.** At most 5,000 domains, oldest evicted first,
   and the upstream read is capped *while* reading rather than after:
   `res.arrayBuffer()` against an endless body never returned — measured, and
   the request's own `AbortSignal.timeout` did not end it — so the shared
   `readCapped` helper now covers the Gravatar lookup too.
10. **The SMTP conversation is bounded.** 64 KB per reply, 100 continuation
    lines, and a wall-clock deadline (`SMTP_DEADLINE_MS`, default 30 s) over the
    whole exchange, because an inactivity timer cannot end a peer that drips
    bytes. `SMTP_ALLOW_INSECURE` warns at construction when it is combined with
    credentials or a non-loopback host.

Each has a test that was watched to fail without it. The three SMTP cases hang
until the runner's timeout without their bound; the endless-body case likewise.

**Still open, and not in the fix order** — the fan-out lead recorded as accepted
rather than fixed: `company_logos` is now bounded in rows and bytes, but nothing
budgets logo *lookups* per account, so one account with many applications can
still drive the shared upstream fetch budget. Named here rather than quietly
dropped.

## Operator facts still needed

No source read settles these, and every `needs_validation` record on the limiter, the
log transport and the email change depends on at least one:

- **Replica count and restart cadence** — they decide whether the 625-day lock-in is
  minutes or days in practice. `railway.json` sets `ON_FAILURE`, so a healthy-but-locked
  process is never recycled.
- **Whether `RATE_LIMIT_LOGIN_FAILURES_WINDOW_MINUTES` is set** on the deployed
  services (it changes the constant, never the 60,000× factor).
- **Which transport each instance resolves to** — the compose shape defaults to the log
  stub unless `EMAIL_TRANSPORT` is named, and only that shape exposes a logged token.
- **The Cloudflare zone's Pseudo IPv4 setting**, and whether any rate-limit rule covers
  `/api/auth/*`. The workspace records one WAF rule, blocking scanner *paths* only, and
  no rate-limit rule at all (`cloudflare/ops.md`), and no token in the workspace can
  read WAF rules.
- **The container memory limit** (~8 GB, owner-stated) — it decides the impact of the
  import parse-work record from the first pass.

## Coverage still open after three passes

The third pass's coverage critic returned `stop: false` and proposed four units:

- **unit-9 — the OAuth lifecycle and provider config** (`lib/services/oauth-accounts.ts`
  is 273 lines, spot-read; `lib/config/oauth-providers.ts` has zero citations in three
  passes). It carries the reachability of two open findings.
- **unit-11 — unread pins and route ownership** (the replace-import CSRF pin, the
  `mustChangePassword` page guard, and the ownership predicate the six uncited
  mutating routes rely on).
- **unit-12 — deployment shape from the workspace**: 35 lines of `cloudflare/ops.md`
  that were skipped, plus `scripts/migrate-on-start.mjs`.
- **unit-13 — session-claim writers and revocation levers** (who calls the client
  `update` trigger; `AUTH_SECRET` rotation as the undocumented all-sessions lever).

Still deferred from the second pass: **request bodies and the middleware body clone**
(13 uncapped `req.json()` call sites).

## What was reviewed

- Revision: `fc5137c` **plus the dirty worktree** (45 paths) — the remediation that
  closes the 2026-10-14 pentest findings. Line numbers are worktree lines; the clean
  HEAD snapshot differs (`lib/db/schema.ts` gains the `session_epoch` column, and
  `lib/auth.ts` gains the whole revocation block).
- Method: 4 reconnaissance agents, 8 coverage-led hunters, 1 coverage critic, 17
  independent verifiers. 30 agent invocations, the approved ceiling.
- Verification contract: each candidate went to a fresh verifier that had not hunted
  it, with instructions to disprove it, and every record was checked against
  `report-schema.json` by the skill's own `validate-findings.cjs`.

**Results: 14 `needs_validation`, 3 `rejected`, 0 `confirmed`.**

Every rejected candidate was rejected for missing impact rather than a broken trace —
in each case the trace held and a control the hunter had not looked for removed the
effect. Three of those controls live outside the application's own source:
Next 15.5's 10 MiB middleware body clone, React 19's `javascript:` href sanitizer, and
the fact that HEAD had no session revocation at all for the 0-seed migration to regress.
That is the single most useful lesson of this run: on this stack the decisive control is
frequently in an installed dependency or the framework, so the next pass should keep
`node_modules` and framework internals in scope deliberately.

## The findings worth acting on

Ranked by what a fix buys, not by label. All are `needs_validation`: the mechanism is
source-verified and, for the two measured items, quantified — what remains unproven is
deployment reach or impact, never the code path.

1. **Import is a second write path that lost the API's controls** — three independent
   defects on one surface: no `emailVerified` check (an unverified account can create
   5,000 applications instead of 3), a re-declared field schema with weaker caps and no
   `isSafeHttpUrl`/`normalizeDomain`/`sanitizeText`, and a `?mode=replace` hard delete
   guarded by a client-side checkbox alone. Fix by making the import schema derive from
   the create/update validators and by enforcing the cap in one policy layer.
2. **The zod row cap cannot bound parse work** — `.max(5000)` is an array-level check, and
   zod parses every element first. Measured: a 5 MiB body of `{}` rows reaches ~1.75M
   elements, 11.1 s of CPU and ~3.2 GB heap before the cap reports. Fix by checking the
   array length before validating elements, or by streaming the document.
3. **The login throttle has two defects with one cause** — the success reset writes the
   wrong key (so an account's own sign-ins accumulate and the sixth is refused), and the
   counter is spent before the password is proven (so an anonymous party can hold a named
   address refused). Confirmed by hand on a disposable instance: six correct sign-ins,
   sixth refused. Fix the key, and consume the counter only on a proven failure.
4. **A verification token is not bound to the address it was issued for** — an old token
   redeems after an address change and marks the new address verified, which flips the
   OAuth decision from `adopt` to `attach` and leaves the squatter's password working.
   Fix by storing the address on the token row (or a digest of it) and comparing at
   redemption.
5. **The session revocation counter is pinned from a post-verification read** — a
   credential change committing during the sign-in is absorbed by the new token. The
   window is 0.25–3 s because an awaited Gravatar fetch sits inside it. Any fix must keep
   the post-bump pin for the OAuth adoption path, where it is correct.

Independent second tier: the three upstream image reads buffer before their size check
(one fix pattern already exists in the import route); the favicon fan-out has no
per-account budget and no cache eviction; the OAuth providers' `email_verified` claim is
never consulted; and the unverified-application cap is check-then-act on the API path.

## Coverage: what this pass did not look at

- **8 of 16 ledger units are `deferred`**: `.github/workflows/ci.yml` and the
  deployment shape (Dockerfile, compose, Railway, `migrate-on-start`, `ensure-owner`)
  were cut by budget; the critic added six more — the epoch *writers*
  (`change-password`, `set-password`, `profile`), three mutating handlers that guard
  with `requireSession` instead of `requireSessionForWrite`, the registration and
  resend-verification lifecycle, `middleware.ts`, the one server action, and the
  hand-written SMTP/TLS client (whose companion exclusion rested on 'no protocol
  surface', which a 410-line reply parser and TLS state machine does not fit).
- **`lib/utils/csrf.ts` was never reviewed by a unit.** The account-deletion control is
  therefore *not* asserted here; treat the 2026-10-14 report's description of it as the
  only evidence.
- **No execution.** No target code was run: the platform can enforce a loopback-only
  sandbox, read-only mounts, tmpfs caps and `prlimit` limits, but no confined
  scratch-promotion helper exists, so no executed check could be recorded as evidence.
  Verifiers that measured something measured an isolated dependency (zod, Node's HTTP
  framing) and said so.
- **Deployment-dependent by construction**: the live `ALLOW_REGISTRATION`, replica count,
  container memory limit, whether an edge overwrites `cf-connecting-ip`, whether the edge
  re-frames request bodies, the served CSP, and whether the Railway origin is reachable
  around Cloudflare.

## Owner-observed confirmation, outside this run's rules

One finding was confirmed by hand on a disposable local instance, outside the audit's
static-only contract: **six consecutive correct-password sign-ins for one account, the
sixth refused**. That is recorded as an owner observation, not as audit evidence, and it
is the reason the throttle key mismatch is listed as measured rather than inferred.

## Hardening notes (not findings)

- Share `readBoundedBody` with the other `await req.json()` auth routes so oversized
  bodies answer 413 instead of being silently truncated into a CSRF failure.
- Evict or cap `company_logos`; it is append-only with a 64 KiB per-row ceiling.
- `name` and `email` written into the JWT by the client-update branch are never
  reconciled against the row (presentational only today).
- Imported `url`/`companyWebsite` reach an anchor href with no scheme re-check; React
  rewrites `javascript:` but the app should not depend on that.
- The account's own sign-ins counting toward its login window is a self-lockout at the
  default threshold; document it or fix the key, but do not leave it undocumented.

## Post-deploy verification, 2026-10-14

Re-checked after the fixes shipped, against the deployed staging instance behind
Cloudflare. Nothing here is source-only: each line is an observed response.

Ten checks, all passing (`tools/strix-pentest/live-verify.sh <url>` — it creates
one throwaway account and deletes it):

| Check | Observed |
| --- | --- |
| Unverified account imports 10 applications | `403 EMAIL_UNVERIFIED_LIMIT`, **0 rows written** |
| One row over the per-file cap | `413 TOO_MANY_APPLICATIONS` in 0.30 s |
| ~5 MB document of minimal rows | `413` in 0.80 s (pre-fix: ~11 s of CPU, ~3.2 GB heap) |
| `?mode=replace` without a CSRF token | `403 INVALID_CSRF_TOKEN`, nothing deleted |
| Six consecutive correct sign-ins | 6 of 6 succeed (pre-fix the 6th was refused) |
| Throwaway account deletion (CSRF + password) | `200`, account gone |

Edge and flag facts, read from outside with no traffic to the app's own logic:

- Both hostnames are Cloudflare-fronted (`server: cloudflare`, `cf-ray …-BKK`);
  `/api/health` no longer publishes the build version on either.
- `ALLOW_REGISTRATION`: **open** on production, **closed** on staging (`403
  REGISTRATION_CLOSED` before validation). Note the asymmetry — staging is
  the locked-down instance and production is the open one.
- The `X-Forwarded-For` throttle bypass is dead: five attempts on one address
  followed by `429` at the sixth **with a fresh forged XFF on every request**,
  on both hostnames. Before the fix the sixth attempt from a new XFF returned
  `401`. The account-keyed counter is now authoritative.
- The old `*.up.railway.app` hostnames answer Railway's own `404 Application not
  found`, so the services are addressed only by the Cloudflare-fronted names.
  Narrow fact: the old hostnames are detached; a `Host:`-header request to
  Railway's edge would still route, so this is not origin-IP secrecy.

Fixed in code, correct by inspection, not live-testable from outside:

- **Verification tokens are bound to the address** — `email_verification_tokens`
  gained an `address` column, and redemption refuses when the account's current
  address differs (`lib/services/account.ts:287`), logging the refusal.
- **The revocation counter is re-checked on every session read**
  (`lib/auth.ts:346-372`): a token whose claim does not match the row is refused,
  so a claim pinned from a pre-change read cannot survive.
- **The create-application cap is inside the insert transaction** with a row
  lock (`lib/services/applications.ts:681`), and both write paths share
  `applicationAllowance()` / `unverifiedLimitError()` — the check-then-act race
  and the "cap written in one handler" cause are both gone.
- **The import body reader caps reads, not just bytes** (`MAX_READS = 8192`).

Still open (the one recommendation not implemented): `company_logos` has no
per-account budget and no eviction, so an account can still grow that table
monotonically through client-supplied domains. It remains a capacity/hygiene
item, rejected as a boundary crossing by verifier-17.

The container memory limit is ~8 GB (owner, 2026-10-14), which makes the
unbounded-parse candidate a CPU-cost issue rather than an outage one — and it is
fixed regardless.

## Second pass, 2026-10-14 — the four deferred units

The first pass listed four units as `deferred`. A scoped second pass hunted and
independently verified them: **10 records — 7 rejected, 3 needs_validation,
0 confirmed** (15 invocations on the cheap route). Records:
[security-audit-2026-10-14-pass2-findings.md](security-audit-2026-10-14-pass2-findings.md).

The three that survived, all in app-authored logic rather than anything a framework
owns:

1. **`verifyEmail`'s address binding is a read-then-write outside any transaction.**
   The final `UPDATE ... WHERE id = ?` has no email predicate, so an email change
   committing between the compare and the write leaves the account verified at the
   new address — and `attach` (unlike `adopt`) keeps the attacker's password and does
   not bump `sessionEpoch`. A pre-registration squat, not takeover of a live account.
   Fix: `WHERE id = ? AND email = ?`, or wrap the compare-and-write in a transaction.
2. **`POST /api/auth/login` is login-CSRF-able.** No CSRF token, no Origin check, no
   `Content-Type` assertion, and no session cookie for `SameSite=Lax` to withhold.
   Measured in Chrome: a cross-site top-level form POST with `enctype="text/plain"`
   gets the response cookie stored. LOW–MEDIUM: the victim's writes land in the
   attacker's account, up to the unverified limit. Fix: assert
   `Content-Type: application/json`, or require the token the framework endpoint
   requires.
3. **`forgot-password` leaks existence through response time.** Status and body are
   equalised; the work is not — the hit path awaits a mail round trip. LOW
   (CWE-203/208). Note `vitest.setup.ts:7` forces the log transport, so the suite
   cannot observe the channel. Fix: defer the send with `after()`.

The seven rejections each died on a control the hunter had not looked for, and six of
those controls live outside app code: Next's server-action Origin check standing in
for `skipCSRFCheck`, the framework's own `private, no-cache, no-store` on dynamic
pages (refuted by *executing* a throwaway Next app, not by reading), the middleware
body clone, `@auth/core`'s cookie defaults, the CORS preflight boundary, and RFC
5321 §4.2.1. Two survivors are race/timing bugs in our own code — which is where a
framework cannot save us.

**Coverage is not complete, and the run says so.** The post-wave critic returned
`stop: true`: every unit has files with zero citations, and in each one that file
contradicts a sentence in the unit's own summary. The item worth funding next is
`lib/utils/rate-limit.ts:30-50` — every throttle shares one in-memory map whose prune
evicts the oldest tenth of *live* windows above 10,000 buckets, so minting 10,000
identities may reset `login-failures:all` and a victim's `acct:login` bucket
together. Also unread: `lib/email/log.ts` (logs token-bearing mail bodies at the
default level), 335 of `lib/auth.ts`'s 417 lines, `session-revocation.test.ts`,
`lib/api.ts`, the OAuth attach/adopt body, and the body-size posture on the 13
unbounded `req.json()` call sites.

Method corrections recorded rather than hidden: two verifiers executed against
isolated non-target surfaces (a throwaway Next app; two throwaway browser origins),
and the run's own "static only" note was wrong.

## Third pass, 2026-10-14 — the limiter map, and the units bug under it

A third scoped pass took the four units run-2's post-wave critic proposed. **10 records —
3 needs_validation, 7 rejected, 0 confirmed.** Records:
[security-audit-2026-10-14-pass3-findings.md](security-audit-2026-10-14-pass3-findings.md).

**The critic's named lead is settled and rejected.** The shared bucket map's overflow
prune really does drop live windows by age, but it cannot reach the process-wide sign-in
cap (whose 625-day `resetAt` sorts last), and the only bound it relaxes — a per-account
15-minute window — is worth 6 guesses per ~10,000 minted identities against 6 for free
after the window. No boundary, no capability.

**The pass found its headline defect one line away from that lead.** `limits()` in
`lib/utils/rate-limit.ts` multiplies a caller-supplied `windowMs` by `60_000` as if it
were minutes, and **both** callers already pass milliseconds:

- the process-wide sign-in failure cap, documented as 100 per 15 minutes in three places,
  is really **100 per 625 days**. An unauthenticated attacker needs no account; one
  source IP and ~101 failures render every account's correct password unusable, and the
  callback path fails **silently** (302 to an error code the login page does not map).
  Only a process restart recovers it. Fix: move the `* 60_000` off the override.
- the per-user write throttle becomes 300 writes per **2,500 days** — which is 60,000×
  *tighter*, so the direction is inverted from the obvious reading: it locks legitimate
  users out of a write scope for the life of the process (the repo's own stress test
  creates 220 applications in one session, 73% of the `applications` budget), and it
  removes no attacker capability.

**Also confirmed this pass:** an email change moves no `sessionEpoch` and proves no
password, and because `forgot-password` gates only on `passwordHash` and mails the token
to the address on file, that makes the current-password gate on account deletion
effectively optional. Re-proving the password before the address may move is the control
that works; the epoch bump alone is not (the attacker keeps the mailbox). And the log
transport writes the whole mail body — a **live** reset or verification token included —
to stdout at `info`, with the database holding only the hash and no retention bound
anywhere; the re-issue purge leaves earlier unused reset tokens valid, so log lines
accumulate as independently live credentials.

### Corrections this pass makes to the earlier record

1. **The session cookie is host-only.** Measured in Chrome 154: no `Domain` attribute, so
   a sibling subdomain never receives it (with a `Domain=`-scoped control proving the hop
   was same-site). The claim that a same-site sibling subdomain carries the cookie —
   repeated in this repo's pentest report and in the pass-2 findings — is wrong. The CSRF
   residual those passes rated LOW needs XSS or a deliberately domain-scoped cookie, not
   merely a sibling host. The matching code comment at `app/api/auth/account/route.ts:27`
   should be corrected by the code owner.
2. **`login-failures:all` cannot be evicted** by the bucket-map flood; the earlier
   sentence that 10,000 identities "may reset" it is refuted — and refuted *because* of
   the 625-day inflation above.
3. **The per-account sign-in window admits 6 failures, not 5**, as `SECURITY.md:81-84`
   states (the increment precedes the comparison).

### The recurring defect: docs that promise controls the code lacks

Five instances now, and they are worth fixing as one sweep: `API.md:19` and `:185`
(per-user and per-IP rate limits that do not exist), the boot refusal (`assertDeployable`
is dead code with no caller and no `instrumentation.ts`, while `.env.example:98`,
`SELFHOST.md:81-82` and the changelog all promise the app refuses to boot), the compose
transport resolution, and `lib/utils/csrf.ts:7-8` on `signOut`. Individually small;
together they mean no claim in this repo can be trusted without checking the code.

### What remains uncovered

This pass's own coverage critic returned `stop: false` and proposed four units, recorded
with their file lists in the **Fix order** section above: the **OAuth lifecycle**
(`oauth-accounts.ts` spot-read; `oauth-providers.ts` never cited), **unread test pins and
route ownership**, the **deployment shape readable from the workspace** (including the
35 lines of `cloudflare/ops.md` this pass skipped), and the **session-claim writers**
(`token.email` is client-settable and never reconciled). Deferred from the second pass:
**request bodies and the middleware body clone**.

### Condition attached to the limiter fix (from the third pass's coverage critic)

The bucket-map eviction lead is rejected **only in the current revision, and only
because of the bug above**. `login-failures:all` currently carries a 625-day
`resetAt`, which sorts it last in the prune's oldest-tenth drop. Ship the one-line
window fix without revisiting `pruneIfNeeded` and that bucket acquires a 15-minute
window — at which point it becomes the drop's easiest prey and the run-2 critic's
original hypothesis ("minting 10,000 identities may reset the process-wide cap")
becomes live. So: **fix the unit bug and the prune together**, or at minimum make the
prune never drop a live window that is still over its limit.

Also recorded from that critique: `rateLimitStatus` destructures only `{ max }`
(`lib/utils/rate-limit.ts:112`) and silently discards the `windowMs` it is handed, so
no status-only caller can ever be time-bounded; and `getClientIp`'s `"unknown"`
fallback means a proxy-less self-host puts every client in one bucket (documented as
the deliberate fail-safe direction, but worth knowing before someone removes the edge).

### Provenance note on the third pass's records

Four evidence paths in `security-audit-2026-10-14-pass3-findings.md` are scratch
artifacts in the audit workspace, not files in this repository
(`.tmp-ghosted-pentest/verify-limit/probe.mjs`, the run-3 probe
`agents/hunter-11/probe/rl-orig.ts`, and verifier-17's
`scratch/cookie-scope/{bcrypt.mjs,probe.stdout.json}`). They were normalised to
relative paths for the report schema, and the measurements behind them are described
in each record. One executed observation — a Chrome 154 cookie-scope measurement —
exists only as that file plus the record's prose, because the assembler globs
`scratch/*.json` and it is stored as `.stdout.json`'s sibling.

## Artifacts

The two documents filed here are the whole report: this file, and
[security-audit-2026-10-14-findings.md](security-audit-2026-10-14-findings.md)
with every verified record (trace, evidence, blockers). The raw run — coverage
ledger, `verdicts.json`, hunter and verifier working files — lives outside the
repository; the counts and validators it reported are:

- `findings.json` — 17 records, `PASS: 17 findings valid`
- `coverage-ledger.json` — 16 units (8 candidate, 8 deferred), validator PASS
- 30 agent invocations, the approved budget ceiling, all on a cheap flash route

## Verification and remediation, same day

Every record was re-checked against the working tree by hand before anything was
changed: the trace re-read in the source, the framework claim re-read in the
installed bundle, and — for the two the audit could only reason about — a test
written first and watched to fail. What that produced:

| Record | Here | Disposition |
| ------ | ---- | ----------- |
| `clearLoginFailures` scope-key mismatch | **confirmed** | Fixed. The bucket key is `acct:login:<address>`; the clear wrote `login:<address>`. Fixed with the key, and the test that was supposed to catch it rewritten — it asserted `toBeNull()`, which a wrong password and a refusal both satisfy, so it could never fail. |
| account-key throttle consumed before proof | **confirmed** | Fixed. Nothing is counted now until a compare fails, and the check is a peek, so an account's own successful sign-ins neither spend its budget nor get refused by it. The residual is kept and documented rather than hidden: five anonymous attempts against a known address still hold its owner out for the window. |
| `session_epoch` pinned from a post-verification read | **confirmed** | Fixed. The credentials path pins the value `authorize()` observed, before the awaited Gravatar fetch; the OAuth path keeps the post-bump pin it needs for adoption. Pinned by a test that drives the race (`user.sessionEpoch` 0 against a row at 1). |
| absolute cap skipped without an `authTime` claim | **confirmed** | Fixed. A claim-less token is stamped on first read, which bounds a pre-upgrade session to seven more days instead of an indefinitely re-signed 30-day window. |
| verification token not bound to the address | **confirmed** | Fixed. `email_verification_tokens.email` (migration `0015`) records the address the token was issued for and redemption compares it; re-issuing now deletes every outstanding token, which is what the docstring always claimed. |
| import field-validation parity gap | **confirmed, data integrity** | Fixed. The importer's row schema is now built from the same field schemas as the create/update routes and text passes through `sanitizeText`, so a file the API would refuse can no longer be written straight to the columns. The `javascript:` XSS was already refuted by the verifier; `data:`/`blob:` are now refused too, by the shared `isSafeHttpUrl`. |
| import unverified-cap bypass | **confirmed** | Fixed. The cap is one function (`applicationAllowance`) used by both write paths, checked in the import transaction against the file's length, with the account row locked. |
| import replace-mode without proof | **confirmed** | Fixed. `?mode=replace` requires the Auth.js CSRF token in `X-CSRF-Token`; the settings page fetches it, the same first step `signOut` takes. |
| zod row cap cannot bound parse work | **confirmed** | Fixed. The route checks `applications.length` before the schema sees the array and answers `413 TOO_MANY_APPLICATIONS`. |
| streamed body reader retains one object per read | **confirmed** | Fixed, more cheaply than projected: a read-count cap (8,192) turns the framing trick into a 413 without a second copy of the bytes. |
| unverified cap check-then-act | **confirmed** | Fixed. The rule moved into `createApplication`'s transaction behind `SELECT … FOR UPDATE` on the account row, which is also what made one policy possible. |
| throttle bucket-map growth (new observation) | **confirmed** | Fixed. A full map now drops the oldest tenth in one batch; the old code only removed expired entries, so an attacker filling it made every new identity cost a full scan. |
| OAuth `email_verified` never consulted | **hardened** | The sign-in gate refuses when the provider says the address is unverified (`=== false`, not `!== true`: LinkedIn omits the claim and a missing claim is not a denial). The provider fact in the blockers is still unproven, and this is the fail-closed side of it. |
| upstream image bodies buffered before the cap | **accepted, not fixed** | The trace holds; the ceiling (fixed hosts, 5 s timeout) makes it a hardening item. Tracked below. |
| favicon fan-out has no per-account budget | **accepted, not fixed** | Needs a product decision about how many lookups one account may cause, not just a cap. Tracked below. |
| account-delete unbounded body (rejected) | **rejection upheld** | Next 15.5's 10 MiB `middlewareClientMaxBodySize` clone re-read in the installed bundle. |
| claim-less epoch token at counter 0 (rejected) | **rejection upheld** | Impact nil at HEAD; the choice is documented and test-pinned. |
| logo cache without owner binding (rejected) | **rejection upheld** | Documented as intended, and the growth half is a hardening note. |

Two things this pass is worth saying plainly:

- **Both of the bugs it found in code were in code written hours earlier, in the
  same session that fixed the pentest report.** A static pass over a dirty tree
  found what the test suite could not, because the tests asserted the behavior
  that was wrong. That is an argument for auditing the working tree, not the last
  commit.
- **`lib/utils/csrf.ts` is still unreviewed by an independent unit**, exactly as
  the coverage section says — and the browser e2e proved the point: the
  control's own unit and integration tests were green while account deletion
  could not work in a real browser at all (Next percent-encodes the `|` in the
  CSRF cookie, and the tests built the cookie in the shape the parser expected).
  The fix has its own test now, but it is still the same session's test.

Still open, in the order a fix buys most:

1. **Upstream image reads** (`lib/services/company-logos.ts`, `lib/services/gravatar.ts`)
   allocate the whole body with `arrayBuffer()` before the 64 KiB / avatar cap
   runs. The repository already has the streaming pattern in
   `app/api/auth/import/route.ts` — three call sites need it.
2. **The favicon fan-out has no per-account budget**, and `company_logos` is
   append-only with no eviction. A cap and a retention rule are a product
   decision (how many lookups may one account cause?) more than a patch.
3. **`readBoundedBody` is not shared** with the other `await req.json()` auth
   routes, so an oversized body there is truncated by the framework clone and
   reported as a validation or CSRF failure instead of a 413. Cosmetic, and the
   rejected body-read finding is why it is not urgent.
4. **The `session` update branch still accepts client-sent `name`/`email`** into
   the token. Presentational only today (every authorization decision reads the
   row), but it is a claim the server does not verify.

Deployment facts, answered where the machine could answer them and left as
questions where it could not:

- **Replica count: more than one.** Identical consecutive requests to
  `/api/auth/login` answered `401 429 401 429`, which is two independent
  in-memory buckets, not a rate limit. Every counter in this pass is per process,
  so a limit's real budget is `max × replicas`.
- **The Railway origin is no longer reachable around Cloudflare** (closed
  2026-10-14): production's generated domain was removed, `ghosted.boo` is the
  only hostname attached, and it goes through the edge. Re-probed with the fix in
  place: a forged `X-Forwarded-For` rotated per attempt is refused at the sixth
  attempt instead of starting a fresh bucket. The **staging** service still
  answers on its generated hostname (`server: railway-hikari`) — the same class
  of exposure, test data only, and it is the deploy-verification path.
- **`ALLOW_REGISTRATION` is live and open** — the production probe earlier today
  got a `201` from `POST /api/auth/register`, and the operator confirmed that is
  intended — so the unverified-cap findings are reachable in production.
- **The container memory limit is not in the repository** and still decides how
  much of the parse-work and image-buffer ceilings are real.
