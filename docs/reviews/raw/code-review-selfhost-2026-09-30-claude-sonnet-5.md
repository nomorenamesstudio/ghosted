# Verdict

Not quite safe to merge as-is — nothing here breaks the hosted instance, but two things in the self-host path have real teeth: the import endpoint reads an attacker- (or bug-) controlled request body fully into memory before its own size guard can act, and the hand-written SMTP client's STARTTLS path — the config every commercial mail provider on port 587 actually uses — is shipped with zero test coverage and a genuinely fragile socket-handoff. Everything else (flags, owner bootstrap, deletion guard, site identity) is careful, well-tested, and reads like someone who has thought about the failure modes. Fix the two items above before calling this ready for someone else's box; the rest can land as-is or with follow-ups.

# Findings

1. **Import's size limit is checked after the unbounded body is already buffered in memory.**
   `declared` is taken from the client-supplied `Content-Length` header, which is not authoritative — nothing stops a caller from sending an inaccurate or absent header and a much larger body. The real check (`raw.length > MAX_BYTES`) only runs after `await request.text()` has already materialized the whole body in memory. On a solo/family self-hosted container (the exact deployment this branch targets, often with tight memory limits), any authenticated user can send a multi-hundred-MB body and OOM the process for every user on the instance.
   Evidence: `app/api/auth/import/route.ts:20-31` (`const declared = Number(request.headers.get("content-length") ?? 0)`, then `const raw = await request.text();`)
   Severity: major
   Effort: S (read the body via a length-limited stream reader and abort once the running total exceeds `MAX_BYTES`, instead of trusting the header).

2. **STARTTLS — the config most SMTP providers actually recommend — is untested and structurally fragile.**
   `sendSmtpMessage` upgrades an already-connected plaintext socket to TLS, then calls `socket.removeAllListeners("data")` *after* the handshake promise has already resolved, builds a second `SmtpSession` around the new `TLSSocket`, and finally always calls `.end()` on the original plaintext `socket` in the `finally` block rather than on the upgraded one. None of `tests/unit/smtp.test.ts`'s fake-server scenarios advertise `STARTTLS` in their capability list, so this whole path — documented in `docs/SELFHOST.md` as the default for `smtp://` on port 587 — has never actually run in CI.
   Evidence: `lib/email/smtp.ts:222-238` (the `STARTTLS` branch and the `finally { socket.end(); }` in `sendSmtpMessage`); absence of a STARTTLS case in `tests/unit/smtp.test.ts`.
   Severity: major
   Effort: M (add a fake server that advertises and negotiates STARTTLS; fix the socket-close target).

3. **The owner password's "printed once" guarantee is about stdout, not about where it ends up.**
   `ensure-owner.mjs` logs the generated password with `console.log`, which is correct as far as the process goes — but on Railway, a Docker host with `json-file`/`journald` logging, or any log-shipping sidecar, that line is retained indefinitely in plaintext wherever logs are collected. There is also no mechanism that forces a password change on first login; the app trusts the operator to remember to do it. This is a reasonable tradeoff for a documented bootstrap step, but it's a real, if modest, exposure window that the phrase "printed once" understates.
   Evidence: `scripts/ensure-owner.mjs:88-96`; `docs/SELFHOST.md` step 2.
   Severity: major (in the sense that it's a live credential with unmanaged retention, not that the design is wrong)
   Effort: S for a stronger warning in the docs, M for actually enforcing a forced change.

4. **Import performs unbatched, per-row `await`s inside one long transaction for up to 5,000 applications × 200 milestones.**
   Every application and every milestone is inserted with its own awaited `INSERT` inside a single `db.transaction`. The Zod schema bounds this at 5,000 applications and 200 milestones each, but that ceiling still permits roughly a million sequential round trips inside one open transaction — long enough to hold locks and plausibly time out on a modest self-hosted Postgres instance.
   Evidence: `lib/services/import.ts:150-193` (the `for (const app of file.applications)` loop with an `await` per milestone).
   Severity: minor
   Effort: M (batch the inserts, or reduce the practical ceiling and document it).

5. **`From`/`To` headers are interpolated without the same CRLF-safety the `Subject` header gets.**
   `encodeHeaderValue` base64-encodes anything outside printable ASCII (which incidentally also catches CR/LF, since `\r`/`\n` are outside `\x20-\x7e`), so `Subject` is safe by construction. `From: ${from}` and `To: ${to}` in `buildMessage` receive no such treatment. Today this is not exploitable — `to`/`from` come from validated account emails and a fixed `EMAIL_FROM` — but there's no defensive line stopping a future caller from passing user-supplied text into either field.
   Evidence: `lib/email/smtp.ts:206-212` (`buildMessage`'s `headers` array) vs. `encodeHeaderValue` only being applied to `subject`.
   Severity: minor
   Effort: S (reject/strip CR/LF from `to`/`from` at the transport boundary).

6. **`ensure-owner.mjs` has a check-then-act race if ever run from more than one replica.**
   `SELECT id FROM users WHERE email = ...` followed by a separate `INSERT` is not atomic. For the documented single-container deployment this is a non-issue; it would only bite someone who scales the app service horizontally without reading the docs.
   Evidence: `scripts/ensure-owner.mjs:75-86`.
   Severity: minor
   Effort: S (`INSERT ... ON CONFLICT (email) DO NOTHING`).

7. **Stale doc comment on `lib/services/import.ts` contradicts its own implementation.**
   The top-of-file comment says "Row ids travel with the file and are reused when they are free" — but the insert never passes `app.id`, and dedup is actually done by `(company, role, createdAt)`, exactly as the changelog for this same chapter says. A future maintainer reading only the code comment would misunderstand the dedup strategy.
   Evidence: `lib/services/import.ts:14-18` vs. the `insert(applications).values({...})` call that omits `id`, and `docs/CHANGELOG.md`'s "Duplicates are recognised by what an application *is*" entry.
   Severity: nit
   Effort: S.

8. **The same boolean-flag parser is reimplemented three times.**
   `lib/config/flags.ts:readFlag`, `scripts/ensure-owner.mjs:readFlag`, and `lib/site.ts:readIndexable` each hand-roll the same `TRUTHY`/`FALSY` set. They agree today, but there's no shared source of truth, so a future edit to one is a silent drift risk (the ensure-owner copy is a duplicate because the boot script can't import from the app's TS module tree — reasonable, but worth a comment saying why).
   Evidence: `lib/config/flags.ts:17-18`, `scripts/ensure-owner.mjs:20-21`, `lib/site.ts:99-103`.
   Severity: nit
   Effort: S.

# Security and data integrity

**Owner password/log.** The random-password-on-boot design is sound in principle (no shared default credential, idempotent on restart, never regenerates an existing account's password). The gap is entirely about *retention*: "logged once" is true of the process's own stdout stream but not of whatever aggregates it. Worth a stronger callout in `docs/SELFHOST.md` that operators should scrub or rotate log retention after first login, since the password sits there un-hashed until then.

**Deletion guard.** `DELETE /api/auth/account` reads `readConfig()` fresh on every call rather than the cached `runtimeConfig()` — explicitly and correctly, per the comment, because a stale "registration is open" answer is the direction that deletes somebody's only account. This is exactly right and worth keeping. The guard is flag-based rather than "count the users" based, which is fine: in the only topology where the flag is off, there is structurally no other way to create a second account, so the two conditions are equivalent by construction.

**Import path.** Authentication is solid (`requireSessionForWrite`), the Zod schema is thorough (bounded string lengths, bounded array sizes, enum-constrained statuses), and the transaction boundary is correct (`replace` deletes and re-inserts inside the same `tx`, so a rejected file changes nothing). Row IDs are never reused across accounts — new UUIDs are always generated on insert — which correctly prevents one account's export from ever colliding with, or overwriting, another account's rows. The `replace` deletion and the "already have this" duplicate scan are both scoped by `eq(applications.userId, userId)`, so there is no path here that lets one user's import touch another user's data. The one real gap is the size-limit enforcement described in finding 1 — the validation logic itself is fine, but it runs too late to protect memory.

**SMTP.** TLS handling for the implicit case (`smtps://`) is straightforward and looks correct. AUTH PLAIN/LOGIN credentials are sent base64-encoded over the (by then encrypted, for smtps) channel — normal SMTP practice, not sent in the clear except over an already-STARTTLS'd or otherwise plaintext connection, which is the provider's problem, not this client's. Dot-stuffing and CRLF normalization are implemented and specifically tested (the changelog even notes the test caught a real defect here — good sign of the test suite pulling its weight). The STARTTLS path, however, is unverified (finding 2) and is the one most self-hosters relying on a generic mail provider will actually use.

**Cross-user leakage.** I looked specifically for this and didn't find any: avatar/logo routes were migrated to the new `getCurrentUser()` seam without losing their per-user `WHERE` clauses, the import dedup and replace-delete are both scoped to the caller's own `userId`, and the account-deletion path is unchanged apart from the new guard. Nothing in this diff widens any query's scope.

# What I would not ship without changing

- **Import body-size check runs too late.** Enforce the 5MB cap on the stream while reading, not after `request.text()` has already buffered it.
- **STARTTLS is unverified.** Either add a real test that negotiates STARTTLS against a fake server, or explicitly tell operators in `docs/SELFHOST.md` to use `smtps://` (465) until it's verified.
- **`finally { socket.end(); }` closes the wrong socket after a STARTTLS upgrade.** Should close whichever socket (`upgraded` or `socket`) the session actually ended up using.
- **Header injection defense-in-depth.** Strip/reject CR/LF from `to`/`from` in `buildMessage`, the same way `encodeHeaderValue` already neutralizes it for `subject`.

# What is good and should stay

- **The single session seam (`lib/auth/current-user.ts`).** Collapsing seven direct `auth()` calls into `getCurrentUser()`/`requireUser()` is exactly the right refactor to do *before* adding deployment shapes, not after.
- **`ConfigError` collecting every problem at once.** Both `flags.ts` and `transport.ts` report the full list of misconfigurations in one boot failure rather than one-variable-per-restart — a genuinely operator-friendly design.
- **Defaults that preserve the hosted instance exactly.** Every new flag, in every file, was checked against "what does the hosted instance need to keep doing," and the tests (`site-identity.test.ts`, `flags.test.ts`) pin that explicitly rather than just testing the new behavior.
- **The dot-stuffing test that caught a real bug.** That's the SMTP test suite earning its keep, not just padding coverage.
- **Idempotent, non-destructive owner bootstrap.** Never touching an existing account on restart, and the explicit test for it (`ensure-owner.test.ts`'s "never touches an account that already exists"), is the correct instinct for anything that runs unattended at every container start.
- **`OperatorContact`/`SelfHostedNotice`.** Refusing to let a self-hosted instance's legal pages imply that Lost Signals Studio has anything to do with someone else's data is a genuinely careful privacy call, not just a cosmetic one.
- **`/api/health` checking the database, not just the process.** Correctly targets the actual common failure mode of self-hosted Postgres-backed containers.