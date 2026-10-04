# Second-round review — `selfhost` branch (stability & security)

## 1. Verdict

Safe to run for the **hosted** instance; not yet safe to hand to self-hosters. The most serious problem is that the prerendered pages freeze the *build-time* identity into static HTML — so a self-hosted instance's privacy policy names No More Names Studio as the data controller, and its landing carries the hosted domain's canonical URL — which is precisely the leakage this branch exists to prevent. The session seam, import path, and SMTP client are in good shape.

## 2. Findings

**1. Prerendered legal pages bake the build-time operator identity into static HTML.**
The branch removed `force-dynamic` from the root layout, which made `/privacy`, `/terms`, `/imprint` and `/` static. Those pages render `OperatorContact` and `Footer`, which call `siteIdentity()` → `runtimeConfig()` at *render* time — which for a static page is **build** time. The compose build passes no `OPERATOR_*` variables and no `SHOW_LANDING`, so the build resolves to the hosted defaults. A self-hoster who follows the guide (sets `OPERATOR_NAME`, `SHOW_LANDING=false` at runtime) still serves a privacy policy stating that No More Names Studio / Krisztian Hadi is the controller, contactable at hey@lostsignals.studio. This is the exact failure the component's own comment promises cannot happen, and `docs/SELFHOST.md`'s "which settings need a rebuild" table explicitly lists `OPERATOR_*` as *runtime* — which is false for these pages. Silent, legally consequential, and invisible to every test in the suite (they render `OperatorContact` directly, not through a built page).
Evidence: `components/OperatorContact.tsx` ("a self-hosted instance must not tell a visitor that No More Names Studio controls their data, because it does not"); `docs/SELFHOST.md` "Read per request (change and restart) | `OPERATOR_*` — footer and legal pages"; `app/(legal)/privacy/page.tsx` renders `<OperatorContact .../>` with no `dynamic` export.
Severity: **blocker** (for the self-hosted shapes)
Effort: M (either `export const dynamic = "force-dynamic"` on the three legal pages, or wire identity through a runtime-evaluated seam)

**2. The self-hoster's canonical URL and `og:url` point at the hosted domain.**
`siteOrigin()` reads `NEXT_PUBLIC_APP_URL`, which for a prerendered page is inlined at build. `docker-compose.yml` supplies `NEXT_PUBLIC_APP_URL` only under `environment:` (runtime), and `build: context: .` passes no build args — so the compose-built image always bakes the fallback `https://ghosted.lostsignals.studio` into the landing's canonical, `og:url`, and the JSON-LD `url` (whose `publisher` is likewise the hosted studio, from the same build-time identity read). The guide's three-command quick start tells the operator to set `NEXT_PUBLIC_APP_URL=http://localhost:8080` in `.env`, which does nothing for these pages; the rebuild requirement is buried in a troubleshooting table. Result: every default-build self-hosted landing advertises the hosted instance's origin as its canonical — the duplicate-content problem this branch claims to have solved, inverted onto the self-hosters.
Evidence: `docker-compose.yml` (`build: context: .` … `NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-http://localhost:8080}` under `environment:` only); `lib/site.ts` (`const raw = env.NEXT_PUBLIC_APP_URL?.trim() || "https://ghosted.lostsignals.studio";`).
Severity: **major**
Effort: S (add the var as a build arg in compose and the Dockerfile) — M to also verify

**3. A default-shape self-hosted instance serves the hosted tracker and is indexable.**
`umami` and `indexable` both derive from `showLanding`, which defaults to `true`. A self-hoster who sets nothing (the "upgrade changes nothing" default) gets `ramen.lostsignals.studio`'s script injected via `/api/config/analytics` (umami's `data-domains` will likely discard the hits, but the third-party script still loads on their visitors) and no `X-Robots-Tag`, no disallowing robots.txt. `.env.example` states the opposite as a property of the software: "a self-hosted copy inherits no tracker and reports nowhere" and "a self-hosted one is noindex by default" — the code cannot know it is self-hosted, so those promises hold only for operators who set `SHOW_LANDING=false`, which the guide's shapes do but the defaults do not.
Evidence: `lib/site.ts` (`umami: ... : hosted ? { ...HOSTED_UMAMI ... } : null`); `.env.example` ("a self-hosted copy inherits no tracker and reports nowhere").
Severity: **minor** (documented shapes avoid it; the env-file comment overpromises)
Effort: S (word the docs as "a self-hosted instance with `SHOW_LANDING=false`", or gate the hosted tracker on an explicit hosted marker)

**4. The "clean production build exits 0" claim does not reconcile with the code shown.**
`next build` runs under `NODE_ENV=production`. Prerendering any page that renders the `Footer` executes `siteIdentity()` → `runtimeConfig()` → `readConfig()`, which with no environment throws `ConfigError` ("ALLOW_REGISTRATION=true needs a delivering email transport in production …") because registration defaults open and the transport defaults to the log stub. Either the verified no-env build did not actually prerender these pages (e.g. `.env.production` or some env leaked in, making the verification vacuous), or the build fails — in which case the compose build path breaks before any of finding 1's symptoms can even appear. One of the claim and the code is wrong; this needs to be resolved before the image is published.
Evidence: `lib/config/flags.ts` (`if (config.allowRegistration && env.NODE_ENV === "production") { if (!transport.delivers) { problems.push(...)`); the branch claim "a production `next build` no longer validates runtime configuration (verified by building with no email variables at all)" in `docs/CHANGELOG.md`.
Severity: **major** (it gates the whole selfhost path)
Effort: S to verify, M if the build does fail

**5. The STARTTLS handshake has no timeout, so a stalling server hangs the send forever.**
`session.detach()` — called immediately before the TLS upgrade — does `this.socket.setTimeout(0)`, disabling the 20-second reply timeout. `upgradeToTls` then awaits `connectTls`'s callback with no timeout of its own and no `close` handler. A server that answers `220 Ready to start TLS` and then stalls (or a middlebox that drops the handshake bytes) leaves `sendSmtpMessage` pending indefinitely; since `sendEmail` awaits the transport inside request paths, a verification-email request hangs until the client gives up. Every other wait in the client is covered by `REPLY_TIMEOUT_MS`; this one window is not.
Evidence: `lib/email/smtp.ts` (`detach(): void { ... this.socket.setTimeout(0); }` and `function upgradeToTls(socket, host) { return new Promise((resolve, reject) => { const tls = connectTls({ socket, servername: host }, () => resolve(tls)); tls.once("error", reject); }); }`).
Severity: **minor**
Effort: S

**6. Email failures are silent to the user, and there is no retry.**
`sendEmail` catches every transport error, logs it, and returns; the API route answers 200 and the UI reports "Verification email sent". A transient SMTP blip (or a provider outage) drops the mail with the user told it was sent — the same one-at-a-time breakage the boot validation exists to prevent, now reachable at runtime instead of at boot. Pre-existing behaviour with Resend, but the hand-written client has more ways to fail transiently and this branch is the moment it becomes self-hosters' reality.
Evidence: `lib/emails.ts` (`} catch (err) { logger.error(... "email send failed"); }`).
Severity: **minor**
Effort: S (at least surface a "may not have been sent" signal) / M for one retry

**7. The Dockerfile is not in the diff, so the container's attack surface is unreviewable.**
The branch description and `docs/SELFHOST.md` ship a Dockerfile, and `docker-compose.yml` builds from `context: .` — but no Dockerfile hunk appears anywhere in this 84-file diff. The container user (root or not), whether `.env` handling and the pruned-dev-dependency assumption hold, and the actual start command that runs `migrate-on-start.mjs` can't be checked against what the guide claims. Combined with finding 4 and your own "not verified" list, the container story rests entirely on trust.
Evidence: `docker-compose.yml` (`app: ... build: context: .`); absence of any `Dockerfile` entry in `git diff --stat main...selfhost`.
Severity: **minor** (process gap; potentially major once the file is reviewed)
Effort: S (include it and re-run this review against it)

## 3. Stability under deployment

**Boot.** The sequence is sound: `migrate-on-start.mjs` holds a `pg_advisory_lock` around migrations, `ensureOwnerAccount` runs inside that lock, and the insert is a single `INSERT … ON CONFLICT (email) DO NOTHING` — concurrent replicas and restart loops are both handled, and an existing account's password is provably never reset (pinned by integration test). If `ensure-owner` throws (missing `GHOSTED_USER_EMAIL`), the unlock line is skipped but the `finally` closes the client, which releases the advisory lock — the restart loop is noisy, not wedged. The generated password is in the first boot's logs indefinitely; documented honestly, and forced change on first sign-in is the right eventual fix.

**Database down or slow.** A request arriving while Postgres is down gets a 500 from any DB-touching page, and `/api/health` answers 503 — good. But `restart: unless-stopped` does not act on an *unhealthy* container, so a running-but-broken app is never restarted; only a crash is. Note that in the logs, don't fix it here.

**Prerendered pages versus runtime decisions.** The middleware/X-Robots-Tag, robots.txt, sitemap, and `/api/config/analytics` are all genuinely per-request and behave correctly from one image — that half of the design works. The half that does not: everything rendered *into* the static pages (`/`, `/privacy`, `/terms`, `/imprint`, the footer, the JSON-LD publisher, the canonical/og origin) is frozen at build with the hosted defaults, and the compose build supplies nothing (findings 1–3). So yes — there is a concrete way a self-hosted instance serves the hosted instance's canonical URL (always, with the documented compose build), its tracker (if `SHOW_LANDING` is left default), and its indexability (same condition). The sitemap and robots routes, being dynamic, use the *runtime* origin from `siteOrigin()`, so a self-hoster who sets `SITE_INDEXABLE=true` gets a sitemap of `localhost:8080` URLs whose pages canonically point at `ghosted.lostsignals.studio` — internally contradictory output from one deployment.

**Upgrades.** The hosted instance is unchanged (defaults match, its build has its env). A self-hoster upgrading with `docker compose --profile selfhost up -d --build` re-bakes the build-time identity from an env-less build, so any operator identity they configured at runtime only ever affected the dynamic dashboard pages, never the public ones — a slow, silent drift they will not notice.

**Unbounded things.** Import is capped at 5MB on the stream with 5,000 applications and 200 milestones per application, inside one transaction — bounded. The one gap is the STARTTLS window (finding 5). The log transport writes full message bodies (including reset links) unbounded, but only by traffic volume and only where configured. Nothing else grows without limit.

## 4. Security boundaries

**Session seam.** All seven former `auth()` call sites route through `getCurrentUser()`/`requireUser()`, and the API guard through `requireSession(ForWrite)` — the seam is single and enforced; I found no route that reads the session another way, and no query that lost its `eq(userId, …)` scope. The login page's new session read is redirect-only.

**`/api/config/analytics` + `Analytics.tsx`.** The endpoint is unauthenticated, but its values are the same two strings that used to sit in the page source — not secrets, `Cache-Control: no-store`, and the client only injects a script when both `src` and `websiteId` come back, from operator-controlled env. No user input reaches `script.src`. The residual issue is finding 3 (the default shape), not the mechanism.

**Import.** `requireSessionForWrite` before the body is read; the cap is enforced on the stream, not the header; Zod bounds every string and array; ids from the file are accepted by the schema but never used — fresh ids are returned per insert; `replace`'s delete and the duplicate scan are both `eq(applications.userId, userId)`; everything is in one transaction so a failed file changes nothing. I looked specifically for cross-account leakage and found none. Two nits I won't number: two *concurrent* imports into the same account can both pass the duplicate scan and double-insert (own data, rate-limited — acceptable), and a hand-authored file with two timestamp-less applications to the same company+role collapses the second (counted as a skip).

**SMTP.** The first round's fixes are real in the code: cleartext is refused unless the server upgrades or the operator opts in (`SMTP_ALLOW_INSECURE=1`), Node's default certificate verification is used (no `rejectUnauthorized: false`), credentials are never logged and a malformed `SMTP_URL` is reported without echoing its value, `From`/`To`/`Subject` all get `assertSingleLine`, dot-stuffing and CRLF normalisation are present and wire-tested, and the reply parser keeps multiline state across chunks. Remaining: the TLS-handshake timeout (finding 5) and the untested handshake against a real certificate — your own caveat, correctly stated in the guide.

**Container.** Compose publishes only the app port (8080, all interfaces — expected behind a proxy, TLS termination documented); Postgres is loopback-only with an overridable password; `AUTH_SECRET` is required with `:?`; the healthcheck probes through the app with a 90-second start period; `.dockerignore` excludes `.env` and `node_modules`. But the Dockerfile itself is not in the diff (finding 7), so the user the container runs as, layer hygiene, and the start command are unverified — do not publish the image on the strength of this review.

**Deletion guard.** Reads `ALLOW_REGISTRATION` fresh (not the cached config), treats an unreadable flag as closed, refuses with a 403 before any deletion, and the settings page only decides whether to offer the button. Fail-safe in the correct direction for a destructive endpoint.

## 5. What I would not ship without changing

- **Finding 1:** add `export const dynamic = "force-dynamic"` to the three legal pages (or move identity out of static render) so runtime `OPERATOR_*` actually reaches them.
- **Finding 2:** pass `NEXT_PUBLIC_APP_URL` as a compose build arg so the documented build bakes the operator's own origin.
- **Finding 4:** re-run the no-env production build and record what actually happens; fix whichever of the claim or the code is wrong.
- **Finding 5:** give `upgradeToTls` a timeout (reuse `REPLY_TIMEOUT_MS`).
- **Finding 7:** put the Dockerfile in the reviewed diff and exercise `docker compose --profile selfhost up` end to end before publishing the image.

## 6. False alarms

- **Owner password in the boot log** — known, documented with the honest "whatever collects stdout keeps it" caveat; the bootstrap itself is idempotent and never resets a changed password.
- **`decodeURIComponent` on SMTP userinfo** — the standard way to read URL credentials; the parsed values never reach a log line.
- **Unauthenticated `/api/health` exposing version and uptime** — appropriate for a probe; configuration details correctly go to the log only.
- **Per-row inserts inside one import transaction** — bounded at 5,000 applications with one statement per application for milestones; it is the caller's own data behind a per-user write throttle.
- **Middleware's lenient flag parsing** — deliberate and correct: the same parser is shared, the strict reader owns the typo, and a typo in middleware becoming a site-wide 500 would be worse.
- **`Buffer.concat(chunks)` on `Uint8Array[]`** — valid; and an empty streamed body parses to a clean 400, not a crash.
- **"The import route has no rate limiting"** — correctly rejected by the first round; `requireSessionForWrite` applies the per-user write throttle.
- **The `landing-logos/` matcher exclusion** — a pattern for a directory that doesn't exist; dead but harmless.