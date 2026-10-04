# Code review: `selfhost` branch

## 1. Verdict

Mergeable after three targeted fixes. The engineering discipline here is unusually good — the seams are clean, the failure modes are thought through, and the test suite is genuinely contract-pinning rather than decorative. The most serious thing in it is the hand-written SMTP client: on `smtp://` (STARTTLS) connections where the server does not advertise `STARTTLS`, it will happily send base64-encoded credentials in cleartext. That is a credential disclosure waiting for one misconfigured provider, and it is a two-line fix.

## 2. Findings

1. **SMTP credentials are sent in cleartext when the server does not offer STARTTLS.**
   In `sendSmtpMessage`, the STARTTLS branch only triggers when `capabilities.includes("STARTTLS")`. If a plain `smtp://` connection is made to a server that does not advertise the extension (a misconfigured relay, a port-587 endpoint behind a broken firewall, a plain port 25), execution falls through to `authenticateAndSend` on the unupgraded `session`, and `AUTH PLAIN <base64(user\0pass)>` goes over the wire in the clear. Base64 is not encryption. The docs tell operators to prefer `smtps://`, but the code accepts `smtp://user:pass@...` and silently degrades. It should refuse to send credentials (or refuse the connection outright) when `!config.secure` and the upgrade did not happen.
   `Evidence: lib/email/smtp.ts:283-295 (sendSmtpMessage, the fall-through past the STARTTLS branch)`, `Severity: major`, `Effort: S`

2. **`robots.ts` is statically generated at build time, so a self-hosted instance ships the build environment's robots.txt.**
   Next.js generates `app/robots.ts` into a static `robots.txt` at build time unless the route is made dynamic. The Docker build runs with no deployment env, so `siteIdentity()` resolves to the hosted defaults (`indexable: true`) and every image — including solo instances whose pages carry `noindex` — ships a `robots.txt` that allows `/`. This is precisely the failure the root layout's `export const dynamic = "force-dynamic"` comment exists to prevent, and it was prevented everywhere except here. The result is contradictory (metadata says noindex, robots.txt says crawl) and undermines the privacy default the branch is built around. Add `export const dynamic = "force-dynamic"` to `app/robots.ts` and verify the emitted file in a running container.
   `Evidence: app/robots.ts:17-26 (no dynamic export; indexable branch)`, `Severity: major`, `Effort: S`

3. **The SMTP subject header is not validated for line breaks — a latent header-injection seam.**
   `assertSingleLine` is applied to `from` and `to` in `buildMessage`, and the comment correctly explains why. But `subject` relies entirely on `encodeHeaderValue`'s ASCII check — and a subject that is *entirely printable ASCII including CRLF* passes through unencoded and unvalidated, so `Subject: hi\r\nBcc: victim@x` would be injected verbatim. Today every subject in the app is a hardcoded template string, so this is not exploitable through any current caller — I want to be explicit that I checked — but the transport is a public seam (`EmailMessage` is exported), and the very next person who interpolates anything user-derived into a subject inherits the bug silently. Add `assertSingleLine(subject, "subject")`.
   `Evidence: lib/email/smtp.ts (encodeHeaderValue ASCII passthrough; buildMessage headers array)`, `Severity: minor (latent)`, `Effort: S`

4. **The deletion guard can 500 on unrelated configuration problems.**
   `readConfig()` in the DELETE route re-runs the *full* deployment validation — including the email-transport checks — not just the registration flag. An instance with, say, `EMAIL_TRANSPORT="resend"` and a rotated-away `RESEND_API_KEY` (registration open, SMTP misconfigured at some later point) will throw `ConfigError` from inside the route on every delete attempt, surfacing as a 500 instead of the intended 403/200. The comment explains the freshness choice and it is the right one; the scope of what gets re-validated is the problem. A minimal read of just `ALLOW_REGISTRATION` (or catching `ConfigError` and treating it as "closed") keeps the guard without coupling it to email config.
   `Evidence: app/api/auth/account/route.ts:12-22 (readConfig() inside DELETE); lib/config/flags.ts:113-131 (readConfig includes transport problems)`, `Severity: minor`, `Effort: S`

5. **The generated owner password lives in container logs indefinitely, and the mitigation is documentation.**
   This is an accepted, honestly-documented risk — the SELFHOST.md callout ("treat the first boot's log as sensitive") is better than most shipped software manages, and `ON CONFLICT DO NOTHING` means it is printed exactly once and never reset. But "printed once by the app" is not "printed once": every log driver retains it, and the operator's realistic action is *not* to prune journald before their first login. A stronger shape would be to force a password change on first sign-in (a `must_change_password` flag checked at login), or at minimum to redact it after a configurable TTL. Given the solo-maintainer constraint and that the doc warns, I rate this minor — but it is the thing most likely to actually bite someone.
   `Evidence: scripts/ensure-owner.mjs:76-83 (password in log line)`, `Severity: minor`, `Effort: M`

6. **The selfhost compose shape still publishes Postgres on host port 5432 with fixed credentials.**
   The comment acknowledges it and says "drop the line", but the shipped default binds `ghosted:ghosted@0.0.0.0:5432` on whatever host runs the compose file — a real exposure for the non-technical self-hoster this guide targets, who will not read the inline comment. Move the `ports:` entry behind the dev-only shape (e.g. a `dev` profile on the `db` service) so the selfhost profile does not publish it.
   `Evidence: docker-compose.yml:22-27 (published port with explanatory comment)`, `Severity: minor`, `Effort: S`

7. **Applications without `createdAt` collapse on company+role alone during import.**
   `identityKey` falls back to `company\0role\0` when there is no timestamp, so a hand-authored file containing two genuinely distinct applications to the same company and role silently loses the second. Real exports always carry `createdAt`, so this only affects hand-made files — but the skip is silent, and the UI will report "1 imported" without explaining why the other vanished. At minimum, dedupe-without-timestamp rows should count and report differently; better, refuse unkeyed duplicates within a single file.
   `Evidence: lib/services/import.ts:196-204 (identityKey fallback)`, `Severity: nit`, `Effort: S`

8. **The import route has no visible rate limiting, and a 5MB / 5,000-application payload is one transaction.**
   `requireSessionForWrite` handles the session; nothing in the diff limits how often it can be called. A user (or a scripted loop with a valid session) can hold long transactions with row locks on their own account repeatedly. It's the user's own data and the caps bound it, so this is a robustness concern rather than a vulnerability — but a per-account rate limit, matching the pattern the account route already uses, is cheap insurance against a self-DoS.
   `Evidence: app/api/auth/import/route.ts:53 (requireSessionForWrite, no rate-limit call)`, `Severity: nit`, `Effort: S`

## 3. Security and data integrity

**Owner bootstrap.** The design is sound: `ON CONFLICT (email) DO NOTHING` with `RETURNING` is the correct idempotent single-statement form (the race the comment describes is real), the password is generated with `randomBytes(12).toString("base64url")` (~96 bits, copy-pasteable — a reasonable entropy/ergonomics trade), and an existing account is never overwritten, which the integration test pins at the database boundary. The residual risk is the log, covered in finding 5. `GHOSTED_USER_PASSWORD` in the environment is visible to `docker inspect`, but that is inherent to scripted setups and documented.

**Deletion guard.** The semantics are "registration is closed", not "this is the only account" — so flipping an instance from open to closed retroactively disables deletion for everyone on it. That is a defensible, conservative reading, and the server-side guard (not just the hidden button) is the right shape. The fresh-vs-cached split is correct: stale in the dangerous direction would delete the only account; stale in the settings page only mis-renders a button. The `readConfig` scope issue is finding 4.

**Import path.** This is the branch's best-defended surface. Zod validation is strict and bounded (5MB streamed with an enforced cap *on the stream*, not post-buffer; 5,000 applications; 200 milestones each; length caps on every string — a hand-authored file cannot smuggle a 50MB `notes` field). Authentication is via `requireSessionForWrite` before the body is read, and the oversized-body test correctly exercises the no-`Content-Length` streaming case. Everything lands in one `db.transaction`, so `replace` mode's delete-then-insert is atomic — the UI's promise "a file that fails to import changes nothing" is true. Crucially, **row ids from the file are accepted by the schema but never used**: both application and milestone ids are discarded and fresh ids are `return`ed, so a crafted file cannot steer inserts at another user's rows, and every write is keyed to the session's `userId`. The `user` block is `z.unknown()` and ignored. I found no cross-user leakage in the import path; the `replace` test explicitly verifies a bystander account is untouched. The transaction-per-application insert loop (finding 8's cousin) is O(5000) round trips but bounded.

**SMTP.** TLS: implicit TLS via `connectTls` uses Node's defaults, so certificates are verified (good — this is not the `rejectUnauthorized: false` trap). STARTTLS, when offered, is taken, and the fake-server test pins that the client does **not** continue in the clear after a failed handshake — a genuinely good property. The gap is the no-STARTTLS-advertised path (finding 1). Credentials: parsed from the URL with `decodeURIComponent`, held only in the config object, never logged; AUTH PLAIN and the LOGIN fallback are correctly framed (`334` prompts consumed stepwise — the fake server's `authStep` comment shows the author understood exactly how this test fakes its way into false positives). Header injection: `from`/`to` refused on line breaks (finding 3 covers `subject`); `bareAddress` unwraps display-name forms for the envelope so `MAIL FROM:` cannot be bracket-broken. Dot-stuffing and CRLF normalisation are present and — per the changelog — the LF-normalisation bug was caught by the wire-contract test, which is the test suite doing its actual job.

**Cross-user leakage, general.** The `current-user.ts` seam preserves the existing per-user `eq(userId, ...)` filters (logos route checks both id and owner); avatars remain explicitly documented as not a boundary and are Gravatar-derived public data. Health endpoint is unauthenticated but leaks only version and uptime — acceptable for a probe.

## 4. What I would not ship without changing

- **SMTP cleartext credentials** — refuse AUTH (or the whole connection) when `!config.secure` and the upgrade did not occur. One `if` in `sendSmtpMessage`.
- **`robots.ts` build-time baking** — add `export const dynamic = "force-dynamic"` to `app/robots.ts` and confirm the emitted file reflects runtime env.
- **Subject line-break assert** — one line: `assertSingleLine(subject, "subject")` at the top of `buildMessage`.
- **Compose Postgres port** — move the `5432` publish out of the default selfhost shape.

## 5. What is good and should stay

- **The `EmailTransport` interface with the `delivers` flag**, and boot validation built on it ("would this config deliver mail?") rather than string-matching env vars — the `ALLOW_REGISTRATION=true` + log-stub refusal is exactly the silent-failure mode that plagues self-hostable apps, killed at boot with a sentence a human can act on.
- **The strict flag reader with empty-means-unset and collect-every-problem-at-once.** Reading `FLAG=` as unset is the single most correct decision in the config layer, and the typo test (`"flase"`) pins it.
- **`readBoundedBody`** enforcing the size cap on the stream, with the test that streams without `Content-Length` — most implementations check the header and feel done.
- **The import's identity-key rationale.** Deviating from "keep row UUIDs" with a written justification (global ids cannot be reused cross-account) is the right call, correctly documented as a deviation.
- **The SMTP wire tests.** A fake server that records the dialogue and asserts on CRLF/dot-stuffing/EHLO order is the only kind of test that makes a hand-written protocol client reviewable, and it demonstrably caught a real defect pre-merge.
- **The `detach()` before STARTTLS** — the subtle bug where the old reader eats the TLS handshake bytes — handled and commented at the exact point a future maintainer would reintroduce it.
- **The tests that pin intent, not implementation**: "never touches an account that already exists" at the real database, the bystander account in `replace` mode, `Cache-Control: no-store` on health. This is what a solo maintainer's future self needs.
- **The honest documentation** — the log-persistence callout, the STARTTLS caveat stated as a caveat, "What self-hosting does not give you". Nothing in the docs oversells the code.