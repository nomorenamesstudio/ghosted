# Security

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's
private reporting instead: *Security → Report a vulnerability* on this
repository, which opens a private advisory only the maintainer can see. If you
cannot use that, email the address on the [imprint](https://ghosted.lostsignals.studio/imprint).

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

## Known dependency advisories (audited 2026-10-04)

`pnpm audit --prod` reports 28 advisories: 2 critical, 11 high, 13 moderate,
2 low. Almost all of them are in **Next.js 14.2.35**, and their fixes are in
**Next 15.x** — a major upgrade, not a patch. Here is the triage, so the numbers
are not mistaken for a wall of exploitable holes:

| Advisory | Applies here? | Why |
| --- | --- | --- |
| Next.js: unauthenticated RCE on **Windows-hosted** servers (critical) | **No** | The image is Linux (`node:22-alpine`); the advisory is Windows-specific |
| Next.js: unauthenticated RCE in the **Image Optimization API** with AVIF (critical) | **No** — and closed anyway | The app uses `next/image` **0 times**; `/_next/image` is now answered with a 404 by `middleware.ts`, and that guard goes away with the Next 15 upgrade |
| Middleware / proxy bypass in **Pages Router** apps with i18n (high) | **No** | App Router only; there is no `pages/` directory and no i18n config |
| SSRF via **rewrites** with an attacker-controlled destination (high) | **No** | `next.config.mjs` defines no rewrites |
| SSRF in **Server Actions on custom servers** (high) | **No** | The app runs Next's own server (`next start` / standalone `server.js`), not a custom one |
| SSRF via **WebSocket upgrades** (high) | **No** | No WebSocket upgrade handling; no custom server |
| PostCSS arbitrary file read / path traversal via `sourceMappingURL` (2 high, 3 moderate) | **No** | PostCSS runs at build time over CSS written in this repository; no attacker-controlled stylesheet reaches it |
| `braces` stack exhaustion via nested patterns (high) | **No** | Build-time glob matching on the repository's own paths |
| Next.js **DoS** with Server Components, request deserialization, and Server Actions (3 high + moderates) | **Partly** — availability only | Reachable unauthenticated, but the impact is a hung or slow response on the operator's own instance. `lib/actions/auth.ts` is the one Server Action (sign-out) |

The practical consequence: **there is no known exploitable vulnerability in this
deployment today**, and the remaining risk is availability, not data. That is
still a real reason to do the Next 15 upgrade rather than sit on 14; it is
planned, and the upgrade resolves the whole table at once.

To reproduce the numbers: `pnpm audit --prod`. CI runs the same command
informational-only (it does not fail the build, because a fix for most of these
does not exist inside the 14.x line).

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
