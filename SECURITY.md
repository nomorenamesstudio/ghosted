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
