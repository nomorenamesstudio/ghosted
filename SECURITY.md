# Security

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's
private reporting instead: *Security → Report a vulnerability* on this
repository, which opens a private advisory only the maintainer can see. If you
cannot use that, email the address on the [imprint](https://ghosted.boo/imprint).

Useful reports say what you did, what happened, and what you expected. A proof of
concept — a curl command, a request, a file — is worth more than a severity
label. There is no bug bounty; this is a solo project, so the honest promise is
an acknowledgement within a few days and a fix or a clear explanation of why it
is not one.

## Supported versions

The `main` branch is the supported version. Self-hosted copies are supported
through the same code: if you run a fork, you carry the fixes.

## What this app holds, and what that implies

Ghosted stores job-hunt data: company names, roles, notes, and interview
timelines, per account. That shapes the threat model:

- **Account isolation is the boundary that matters most.** Every query is scoped
  by the session's user id, and the import path never trusts ids from an uploaded
  file.
- **A self-hosted instance is private by default**: `robots.txt`, the sitemap and
  an `X-Robots-Tag` header all refuse crawlers unless the operator opts in with
  `SITE_INDEXABLE=true`.
- **The operator sees everything on their own instance** — it is their database.
  Encryption at rest is the host's job, not the app's.

## Sessions and sign-in throttling

Two things a JWT session strategy does not give you for free, and what this app
does about them. Both were findings of the [2026-10-14 pentest](docs/reviews/pentest-local-2026-10-14.md),
and the details of both were corrected by the [static
audit](docs/reviews/security-audit-2026-10-14.md) the same day.

**A credential change ends the sessions that came before it.** `users.session_epoch`
moves on a password change, a password reset, a first password, and a provider
sign-in that clears one; the `jwt` callback refuses a token whose claim no
longer matches, and a deleted account has no row to match at all. Without it, a
copied session stayed usable until the 7-day absolute cap. The cost is one
indexed lookup per session read, and the session that makes the change is
revoked with the others — the UI signs out and says so. The credentials path
pins the counter the password was *checked against*, so a change committing
during that same sign-in revokes it rather than being absorbed.

**Sign-in attempts are counted server-side, never from a request header.** The
per-account counter is enforced inside Auth.js's Credentials `authorize()`
callback, which both `/api/auth/login` and `/api/auth/callback/credentials`
reach, so there is no route to walk around it. `getClientIp()` prefers
`CF-Connecting-IP`, then `X-Real-IP`, and only then the last `X-Forwarded-For`
entry — which is client-supplied and therefore not a security boundary.

**Only failures are counted, and a success clears the account's window.** The
check is a peek; the counters move when a compare fails. That distinction is not
cosmetic: the first version spent a slot before proving the password and cleared
a key nothing wrote, so six *correct* sign-ins by one person ended with that
person refused entry to their own account.

What that means in practice, measured rather than assumed:

- **A per-IP limit is attacker-chosen wherever an origin is directly
  reachable.** On `ghosted.boo` that is settled: the service's generated Railway
  domain was removed on 2026-10-14, Cloudflare is the only way in, and a probe
  that rotates a forged `X-Forwarded-For` per attempt is refused at the sixth
  instead of starting a fresh bucket. A self-hosted instance whose origin can be
  reached around its proxy is the case this bullet still describes — there
  `x-forwarded-for` is the client's own string. The account-keyed counter and the
  process-wide failure cap do not depend on it.
- **The counters are per process, and production runs more than one replica**
  (identical consecutive requests answering `401 429 401 429` is the signature).
  They reset on restart and do not span replicas, so an attacker's real budget is
  the configured limit times the replica count. Redis (or any shared store) is
  the fix; the account-keyed counter scales with replicas but is never useless.
- **Refusing an attempt is the only thing that bounds guessing, so a named
  address can be locked out on purpose.** Five failed attempts hold an account's
  next sign-in out for the rest of the window — a legitimate password included,
  because the alternative is evaluating every guess. Shortening
  `RATE_LIMIT_WINDOW_MINUTES` narrows the window; the process-wide cap below
  bounds how many addresses one attacker can hold at once.
- **`RATE_LIMIT_LOGIN_FAILURES_MAX` (100 per 15 minutes) refuses every sign-in
  once hit, including a correct password.** That is the point — a cap that only
  refused wrong passwords would cap nothing — and it is also a lockout an
  attacker can trigger deliberately. Raise it, or move the counters to a shared
  store, if that trade is wrong for an instance.

**Deleting an account takes proof, not a cookie.** The session cookie is
ambient: it rides along on any request the page can make, so
`DELETE /api/auth/account` also requires the Auth.js CSRF token and, for an
account that has a password, that password. Provider-only accounts have no
password to prove, so the token is their whole check. A `?mode=replace` import —
the only other action that hard-deletes a user's data — asks for the same token.

**One write contract, whichever door the data comes through.** The importer's row
schema is built from the field schemas the create/update routes use, so a file
cannot carry a URL scheme, a domain, an email or a text length that the API would
refuse, and imported text goes through the same sanitizer. The
unverified-account application cap is one function used by both write paths, and
it is checked inside the transaction that writes — not in the route that fronts
it, which is how the importer missed it and how two parallel creates could both
see the same stale count.

**Verification tokens are bound to the address they were issued for.** Changing
the account's email invalidates outstanding links, so a token minted for one
address cannot verify another: without that, an attacker could register with a
mailbox they control, move the account to a target address that has no account,
redeem the old token, and arrive verified — which flips provider sign-in from
"adopt" to "attach" and leaves their password working. A provider sign-in that
reports the email as *unverified* is refused outright; a provider that omits the
claim (LinkedIn) is not treated as a denial.

## Dependency advisories

`pnpm audit --prod` reports **one** finding, and it is explicitly accepted in
`package.json` (`pnpm.auditConfig.ignoreGhsas`):

| Advisory | Applies here? | Why it is accepted |
| --- | --- | --- |
| `braces` stack exhaustion through deeply nested patterns (high, GHSA-vfj7-8cjw-p6xm) | Build time only | It arrives through `micromatch` in the tooling path, matching the repository's own paths, and **no released version fixes it** (the advisory lists no patched version). The alternative is dropping the toolchain that depends on it. |

That is a different picture from the one this file described before the Next 15
upgrade, and it is worth recording how it changed, because the numbers were
alarming and mostly inapplicable:

- Before: **28 advisories — 2 critical, 11 high, 13 moderate, 2 low**, nearly all
  in Next.js 14.2.35, whose fixes existed only in Next 15. The two criticals were
  a Windows-only RCE (this image is Linux) and an RCE in the image optimizer when
  **AVIF** files are optimized — the second was pinned shut by configuration:
  `next/image` is used nowhere, `public/` ships no AVIF, `images.formats` is
  `["image/webp"]`, and with no `remotePatterns` the optimizer refuses non-local
  URLs (`400 "url parameter is not allowed"`, asserted in CI).
- After the upgrade to Next 15.5.x and React 19: **5**, of which three `postcss`
  advisories were closed by pinning `postcss` to the patched line in
  `pnpm.overrides` (it sits in the production graph, because Next processes CSS
  with it), leaving the one row above.

Two more advisories were published after that upgrade and were closed the same
way, by pinning the patched line in `pnpm.overrides` rather than writing an
exception: `source-map-js` (high, GHSA-68fv-2mgg-jv7q, via Next's own postcss)
and `postcss-selector-parser` (moderate, GHSA-rj75-hqrm-r3gf, via
`tailwindcss-animate` → tailwindcss). Both are build-time dependencies, and
pinning a fix is always better than explaining a risk away.

CI runs `pnpm audit --prod` **as a blocking check** now: a new advisory in the
production tree fails the build, and anything accepted has to be written down
here first.

## Secrets

- `AUTH_SECRET` is required by the compose file and the app refuses to start
  without it.
- No secret is baked into the image: `.dockerignore` excludes `.env`, and the
  runtime image is built from Next's standalone output.
- SMTP credentials are never logged; a malformed `SMTP_URL` reports the variable
  name, not the value.
- **One generated secret is logged on purpose**: a boot-seeded owner's first
  password, printed once so the operator can sign in. That account cannot write
  anything until the password is replaced (`403 PASSWORD_CHANGE_REQUIRED`), which
  is what keeps a log line from being a working credential.

## Reporting a false positive

If a scanner flags something above, this document is the answer to "did you know
and why is it not fixed". If the reasoning is wrong, that is a report worth
making too.
