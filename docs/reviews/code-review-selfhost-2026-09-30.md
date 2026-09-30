# Code review of the `selfhost` branch — three models, merged (2026-09-30)

Three independent reviews of the same diff (`main...selfhost`, 53 files, +3.2k),
then every claim checked against the code before it entered the plan. Raw
transcripts: [`reviews/raw/`](raw/) — Claude Sonnet 5, GPT-6 Sol, GLM latest.
Total cost: **$0.55** ($0.30, $0.16, $0.09).

This is the code counterpart to the [design review](design-review-2026-09-24.md).
Everything below shipped in `4f68bd0` and `f8b6b66`, except where marked
*deferred*.

## Verdicts

| Model | Verdict |
| --- | --- |
| Claude Sonnet 5 | Not safe to merge as-is: two findings with teeth (import body cap, STARTTLS), the rest careful |
| GPT-6 Sol | Not safe for the documented self-hosting path: exposed Postgres, and a clean production build could fail |
| GLM latest | Mergeable after three targeted fixes; "the engineering discipline here is unusually good" |

## Consensus findings — found by two or three reviewers, all real

1. **SMTP would send credentials in the clear.** `smtp://` took STARTTLS only if
   the server advertised it, otherwise it authenticated on the plain socket.
   *Fixed:* refuse unless the server upgrades; `SMTP_ALLOW_INSECURE=1` is the
   documented exception for an unauthenticated relay on the same host.
2. **`robots.txt` was generated at build time.** A published image would ship the
   build environment's rules — allowing crawlers beside `noindex` pages.
   *Fixed:* `export const dynamic = "force-dynamic"`; the production build output
   now lists `ƒ /robots.txt`.
3. **Postgres was published on every interface with a password written in the
   compose file.** *Fixed:* `127.0.0.1:5432` only, `POSTGRES_PASSWORD`
   overridable, and the guide says to set it. GLM wanted the port removed from
   the self-hosting shape entirely; the service is shared with the dev shape, so
   loopback binding plus an overridable password was the honest fix.
4. **The generated owner password survives in container logs.** *Documented*
   rather than closed: `docs/SELFHOST.md` now says the log keeps it until rotated.
   *Deferred:* forcing a password change on first sign-in (`must_change_password`)
   — a schema column, a login check and UI, so its own change.

## Single-reviewer findings, verified and fixed

| Finding | Reviewer | Fix |
| --- | --- | --- |
| A production `next build` failed on a valid configuration (`siteIdentity()` at module scope) | GPT-6 Sol | Metadata into `generateMetadata()`, identity read at render; **verified: build with `.env` moved aside and no email vars, exit 0** |
| A split TCP reply lost the earlier lines of a multiline SMTP reply | GPT-6 Sol | In-progress reply is session state; test splits the EHLO reply across chunks |
| Timestamp-less imports were not idempotent | GPT-6 Sol + GLM | Rows without `createdAt` match on company + role against every existing row; in-file collapses counted as skips |
| `Subject` was unguarded against a line break | GLM | Same `assertSingleLine` guard as `From`/`To` |
| The deletion guard re-validated the whole deployment (a rotated key → 500) | GLM | Reads the one flag; an unreadable flag counts as closed |
| A malformed `SMTP_URL` echoed itself — password included | GPT-6 Sol | The message names the variable, never the value |
| Health implied a readiness it never checked | GPT-6 Sol | Reports configuration, 503 when invalid, details to the log only |
| The hosted instance lost analytics unless three variables were added | GPT-6 Sol | The hosted **shape** keeps its own tracker as a default; self-hosted still renders none |
| Unbatched per-milestone inserts inside one transaction | Claude | One statement per application |
| The same boolean parser written three times | Claude | Shared `readBooleanFlag`; a `SITE_INDEXABLE` typo now stops the boot |
| Stale comment describing id reuse in `lib/services/import.ts` | Claude | Corrected |

## Checked and rejected

- **"The import route has no rate limiting"** (GPT-6 Sol, GLM): `requireSessionForWrite`
  applies the per-user write throttle — 300 requests/hour by default, keyed on the
  user id. The claim was wrong in both reviews.
- **"`decodeURIComponent` on SMTP credentials is unsafe"**: it is the standard
  way to read userinfo from a URL, and the parsed values never reach a log line.

## What all three said should stay

The single session seam; `ConfigError` collecting every problem at once; strict
flag parsing with empty-means-unset; the `EmailTransport` interface with
`delivers` driving boot validation; the streamed import cap; the SMTP wire tests
that caught a real defect pre-merge; the non-destructive owner bootstrap; the
hosted-instance defaults that make an upgrade a no-op; `/api/health` checking the
database rather than the process; and the docs refusing to oversell the code.

## Still open after this round

1. **Forced password change on first sign-in** for the seeded owner (above).
2. **STARTTLS handshake never exercised against a real certificate** — the
   client's decision and its refusal to continue in the clear are tested; the
   handshake is not. `smtps://` has no such caveat, and the guide says so.
3. **The Docker image build is still unverified end to end** — the production
   build path has now been exercised locally (see above), but not `docker build`
   plus `docker compose --profile selfhost up`.
