# Security audit — 2026-10-14 (static, source-only)

**Run status: incomplete.** Coverage is partial by construction, not by failure: the
approved budget funded 8 hunter units and 17 verifications, and the critic's six
additional units plus two platform units are recorded as `deferred` in the coverage
ledger with their reasons. No target code was executed: this pass produced source
traces and, where a verifier could isolate a dependency, a bounded measurement of
that dependency alone. Every verdict is therefore `needs_validation` or `rejected` —
nothing here is called `confirmed`, and nothing should be described that way.

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
- **The Railway origin is still reachable around Cloudflare**: `GET` on the
  service's own `<service>.up.railway.app` hostname answers `200` without the
  edge, which is what makes any header-derived key forgeable there. (The exact
  hostname is withheld here on purpose: it is the bypass.)
- **`ALLOW_REGISTRATION` is live and open** — the production probe earlier today
  got a `201` from `POST /api/auth/register`, and the operator confirmed that is
  intended — so the unverified-cap findings are reachable in production.
- **The container memory limit is not in the repository** and still decides how
  much of the parse-work and image-buffer ceilings are real.
