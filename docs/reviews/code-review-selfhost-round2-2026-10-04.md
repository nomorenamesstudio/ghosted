# Second-round code review — stability and security (2026-10-04)

Two models reviewed the whole `main...selfhost` diff a second time, this time
with a narrow brief: **stability and security**, not style or design taste.
Claude Sonnet 5 and GLM latest. Raw transcripts:
[`raw/`](raw/) (`code-review-selfhost-round2-2026-10-04-*.md`). Cost: **$0.37**
($0.30 + $0.08).

Every claim below was checked against the code or against a running container
before it entered the plan. The two reviewers did not agree on everything, and
one of them predicted a failure that the first `docker build` of this round
confirmed.

## Verdicts

| Model | Verdict |
| --- | --- |
| Claude Sonnet 5 | "Not yet safe to run unattended for strangers"; most serious item is that the dynamic-route guarantees are asserted only against a dev server, not a built image |
| GLM latest | "Safe for the hosted instance; not yet safe to hand to self-hosters" — the prerendered pages freeze the build-time identity |

## The blocker both of them were circling

GLM stated it as a finding, Claude as a verification gap, and both were right:
**the moment the landing became prerendered, deployment identity started being
frozen into static HTML.** GLM's version was concrete — a self-hosted instance
would serve a privacy policy naming the hosted studio as the data controller —
and its finding #4 called the build claim in the changelog impossible.

It *was* impossible. The first `docker build` of this round failed:

```
Error occurred prerendering page "/register" …
ConfigError: Invalid configuration:
  - ALLOW_REGISTRATION=true needs a delivering email transport in production
```

`next build` runs with no environment at all, so "open registration needs
working mail" was being judged by the build — of an image whose runtime
configuration is perfectly valid. The earlier "clean build, exit 0" note was
true when it was written and stale by the time the branch was prerendered. The
changelog has been corrected rather than quietly left standing.

## What was fixed in this round

1. **Deployment rules moved out of rendering.** `readConfig()` now judges the
   shape flags only; `deploymentProblems()` holds the rules that are about a
   *deployment* and is called by the health probe; `canDeliverMail()` is the same
   fact as a predicate, enforced by `POST /api/auth/register` — where it stops a
   real person instead of failing a build.
2. **The pages that state who runs the instance render per request** — the three
   legal pages and the auth group. Baked, a self-hoster's privacy policy would
   name somebody else as controller (GLM's blocker) and their sign-in screen
   would link to a landing that is switched off.
3. **The landing carries no deployment identity at all.** The footer credit moved
   to `/api/config/site` + `components/FooterCredit.tsx`, the tracker was already
   runtime, and the JSON-LD no longer names a publisher. The e2e asserts the
   served HTML contains neither the tracker host nor the operator name.
4. **The compose build passes `NEXT_PUBLIC_APP_URL` as a build argument**
   (GLM's finding #2): the origin is baked by design, so a `--build` deployment
   must bake *its own*. Verified inside the built image: the prerendered HTML's
   canonical is the value passed at build.
5. **The STARTTLS upgrade has a deadline** (GLM's finding #5). `detach()` clears
   the reply timeout before the handshake, which left the one wait in the client
   that nothing bounded: a server that answers `220` and stalls hung the send
   forever.
6. **The success path of STARTTLS is now tested** (Claude's #1): a fake server
   with a self-signed certificate completes a real handshake, and the test
   asserts the second EHLO happens inside the tunnel and credentials are only
   sent after it.
7. **A failed send is no longer reported as success** (GLM's finding #6) on the
   path where saying so is safe: `sendEmail` returns whether the transport
   accepted the message, and the resend button tells the user when it did not.
   Registration and password reset still answer generically — reporting a failure
   there would reveal whether an account exists.

## Found by doing, not by reading

Two things neither review could see, both surfaced by actually running the
documented path:

1. **`ALLOW_REGISTRATION=false` was not enforced anywhere.** The flag hid a link
   and gated account deletion; the API and the register page happily accepted
   sign-ups. The docs promise a solo instance is closed, so this was an
   access-control hole in the shape the guide recommends. Now: the API refuses
   with `REGISTRATION_CLOSED`, the register page redirects, and the login screen
   does not offer the link. Proven by a test that failed before the fix and by a
   container returning `403`.
2. **The database volume was globally named**, so a second instance on the same
   host silently mounted the first one's data (and `down -v` in either project
   deleted it). It is now overridable per instance (`GHOSTED_PG_VOLUME`), which
   is also what let this verification run on its own database instead of the
   developer's. The guide documents both this and the related trap that Postgres
   only reads `POSTGRES_PASSWORD` when the data directory is created.

## Checked and rejected

- **Health conflating configuration with liveness** (Claude's #6): a *rotated
  key* is a genuinely misconfigured deployment, so marking it unhealthy is the
  intended answer rather than a false alarm. The restart-loop worry only applies
  to orchestrators that restart on unhealthy, and the docs use compose, which
  does not.
- **The three independent flag readers** (Claude's #5): the deletion guard and
  the sign-up route now share one `registrationOpen()`, so this is fixed rather
  than rejected — but the middleware boundary stays, because the Edge runtime
  cannot import the logger or the email transport.

## Verified end to end (this round, for real)

The documented path now runs: `docker build` → compose → migrations under an
advisory lock → owner bootstrap with a one-time password in the log → health
`{"ok":true,"config":"ok"}` → `/` redirecting to `/login` from middleware
reading live environment → `X-Robots-Tag: noindex, nofollow` → `robots.txt`
disallowing everything → an empty sitemap → `/api/config/site` answering
`operator: null` (the instance does **not** wear the hosted studio's name) → the
API refusing a sign-up on a closed instance → the container running as
`uid=1000(node)` with no `.env` in the image.

## Still open

1. **Forced password change on first sign-in** for the seeded owner — both
   reviewers raised it, Claude in its "would not ship without" list. Deferred as
   its own change: schema column, login check, UI.
2. **A prebuilt image would still bake the build-time origin** into canonical and
   `og:url`. Documented in the guide; the compose path passes the origin at
   build, so this affects only someone publishing an image for others.
3. **The image is 2.4 GB**, which is heavy for a self-hosted tool: the multi-stage
   build keeps the full dependency layer. Worth a squash/prune pass.
