# API Reference

## Base URL

`https://ghosted.boo/api` (production) or `http://localhost:3000/api` (dev)

## Conventions

- Every route requires an authenticated session (`Auth.js` JWT cookie) and
  scopes all queries to `session.user.id`. Unauthenticated requests get 401.
- Input is validated with Zod; invalid payloads get 400 with a
  `VALIDATION_ERROR` code and per-field details.
- Errors always use the shape:

```json
{ "error": "human message", "code": "MACHINE_CODE", "details": {} }
```

- Request bodies are capped at 64 KB: anything larger is `413
  PAYLOAD_TOO_LARGE` before a schema sees it. Imports have their own, larger
  bound.
- State-changing endpoints are rate limited per IP and per user (see
  SETUP.md for defaults). Exceeding a limit returns 429 with a
  `Retry-After` header. Sign-in is additionally limited per account and, in
  total, per process — those counters are enforced inside Auth.js's credential
  check, so they apply to `/auth/callback/credentials` as well, and they do not
  depend on any request header.
- API responses are never cached: `Cache-Control: no-store` is applied to
  all `/api/*` responses and to `/ouija` (middleware).

## Applications

### GET /applications

List applications with filters, search, sort and pagination.

Query params: `status`, `search` (company/role, case-insensitive partial),
`sort` (`company | status | updated_at`, default `updated_at desc`),
`page` & `limit` (default `1` / `20`, max 100).

Response:

```json
{
  "data": [{ "id": "...", "company": "Acme", "role": "Engineer", "status": "applied" }],
  "pagination": { "page": 1, "limit": 20, "total": 42 }
}
```

### POST /applications

Create an application (company, role, url?); creates the default 5-step
timeline. Unverified accounts are capped at `UNVERIFIED_APP_LIMIT` (default
3) applications - exceeding it returns 403 `EMAIL_UNVERIFIED_LIMIT`.

Request: `{ "company": "Acme", "role": "Engineer", "url": "https://...",
"companyWebsite": "acme.com" }` - `companyWebsite` is optional, accepts a bare
domain or a full URL, and is stored normalized (`acme.com`); `""` or `null`
clears it. It only feeds the company-logo lookup, where it overrides every
guess. `PATCH /applications/:id` takes the same fields.
Response: `201` with the created application + milestones.

### GET /applications/revision

A fingerprint of the account's board, for an open tab to detect writes it did not
make (an agent through MCP): `{ data: { revision: "…" } }`. It hashes the id,
status, step count, favorite flag and `updated_at` of every application, so a new
row, an archive, a manual rejection or a finished milestone all move it — not just
the silence clock, which deliberately stays put for some of those. Polled by
`components/LiveRefresh.tsx` every 15 s (and on window focus); the client refetches
`applications`, `application` and `stats` only when the value moves.

### GET /applications/match

"Is this already on the board?" — the read the add form makes before it writes.
Query: `url`, or `company` + `role`. Returns
`{ data: { matches: [{ id, company, role, status, updatedAt }], verdict } }`,
where `verdict` is `none`, `active` (a live row matched — anything but rejected or
archived) or `closed` (every match was rejected or archived). It never blocks a
write: a reapplication after a rejection is a real thing, so the form shows the
notice and lets the user file a second row.

### GET /applications/:id

Single application with its milestones. Cross-user access returns 404.

### PATCH /applications/:id

Update fields and/or status. Directly setting `status: "archived"` records
`archivedFromStatus` so a later reopen restores the exact previous status.

### DELETE /applications/:id

Soft delete (sets `status = "archived"`). Archived apps stay in the database
and are visible via `status=archived`; they count nowhere in stats.

### POST /applications/:id/reopen

Restore an archived application to its pre-archive status.

### POST /applications/:id/favorite

Toggle the favorite flag (favorited apps are pinned to the top of lists).

### POST /applications/:id/milestones

Add a milestone at a position (defaults to append; reorders `step_order`).

Request: `{ "title": "Phone screen", "position": 1 }`

### PATCH /milestones/:id

Update milestone title/status/comment/date. Marking a milestone done records
today's date automatically; status changes recompute the derived application
status (unless the status is a manual terminal state).

### DELETE /milestones/:id

Remove a milestone and reorder the remaining `step_order` values.

## Dashboard

### GET /dashboard/stats

Counts: `total` (non-archived), `active` (applied + interviewing, excluding
ghosted), `interviewing`, `offers`, `rejected`, `ghosted` (applied/interviewing
silent for longer than the user's Patience level). Archived apps count nowhere.

### GET /api/applications/roles

Role titles the signed-in user has used, most recently used first (up to 20).
Feeds the autocomplete on the role field — read from the applications
themselves, so there is nothing extra to keep in sync.

## Company logos

### GET /logos/:applicationId

The company logo chip on an application card. Not under `/api` on purpose:
logo bytes are not user data and must be cacheable, while every `/api/*`
response is `no-store` (see Conventions above).

- Requires a session and scopes the lookup to the signed-in user's own
  application. Unauthenticated or unknown ids get a plain `404` (the landing
  page renders the same card component with fake ids, and a signed-out
  visitor should just see the monogram).
- `200` returns the icon (`image/png`, `image/x-icon`, `image/vnd.microsoft.icon`,
  `image/jpeg`, `image/webp` or `image/gif`) with
  `Cache-Control: private, max-age=31536000, immutable`. Version the URL with
  `?v=<application.updatedAt>` - an application edited to another company then
  gets a different URL instead of a stale logo. SVG is never stored or served:
  third-party SVG from our own origin is a script-execution path.
- `404` (no icon for this company) is returned with `Cache-Control: private,
  max-age=3600` so the browser does not retry on every render.

Icons are fetched server-side from Google's favicon service, falling back to
DuckDuckGo, and cached in the `company_logos` table keyed by domain. Domains are
tried in order: the application's own `companyWebsite` first, then the posting
host, then board/parent/slug guesses. Only a validated domain is ever sent to
those two fixed hosts - a user-supplied URL is never fetched, so there is no
SSRF surface.

### GET /avatars/:hash

The signed-in user's Gravatar for their email address, keyed by the MD5 of the
trimmed, lowercased address (`lib/utils/gravatar.ts`). Same reasoning as
`/logos/:id` for living outside `/api`, plus one of its own: Gravatar's own
cache is only `max-age=300`, so proxying is what makes a week-long cache
possible — and gravatar.com never sees the visitor.

- Requires a session; unauthenticated requests, a malformed hash (anything that
  is not 32 hex characters) and an upstream error all get a plain `404`. A
  Gravatar is public by construction, so this is not a security boundary — it
  just keeps the route from being an open image relay.
- `200` returns the avatar (`image/png`, `image/jpeg`, `image/webp` or
  `image/gif`) with `Cache-Control: private, max-age=604800,
  stale-while-revalidate=86400` and `X-Content-Type-Options: nosniff`. SVG is
  never served: third-party SVG from our own origin is a script-execution path.
- `404` (this email has no Gravatar, or the upstream body failed validation) is
  returned with `Cache-Control: private, max-age=3600`, and the client's
  `AvatarFallback` shows the user's initials.

Upstream is always `https://www.gravatar.com/avatar/<hash>?d=404&s=160&r=g` —
`d=404` rather than a placeholder image, so "no Gravatar" is a 404 we can fall
back from instead of a picture we would have to pass off as the user. The same
lookup runs once at sign-in (`lib/services/gravatar.ts`); a hit puts
`/avatars/<hash>` in `session.user.image`, a miss leaves it unset so no image
request is made at all.

### POST /api/applications/:id/milestones/reset

Sends an application's timeline back to the start: every step returns to
`pending` and its date is cleared, so progress reads 0% again while the step
titles are kept, and the application's status is re-derived from the reset
steps (which lands it back at `applied`). Used by the kanban board when a card
is dragged back from Interviewing to Applied and the user chooses to reset.
Returns `{ data: application, milestones: [...] }`; `404` for another user's
application.

## Agent access (MCP)

Ghosted serves its own MCP server at `POST /ouija` (streamable HTTP, stateless), so
an agent needs a URL and a bearer token — nothing is installed next to it and no
version has to be kept in step. The name is the joke: an MCP client is the
planchette, Ghosted is what went quiet. Settings → Agent access hands over the
token.

```json
{ "mcpServers": { "ghosted": { "type": "http", "url": "https://<host>/ouija",
  "headers": { "Authorization": "Bearer ghosted_agt_…" } } } }
```

Auth is the bearer token only: a browser session cannot reach `/ouija`, so a
cross-site request cannot drive the tools with the user's cookies. A minted token
is stored as its SHA-256 and shown once. A *pairing* is different: while a code
can still be collected, the pairing row holds the token in plaintext so the
handover can return it, and the row is deleted the moment it expires — by the
claim that finds it, or by the next pairing read. Revoking a token takes effect on
the next request. Tokens are deliberately independent of session revocation — a
password change revokes sessions, not agents; Connected agents is where an agent
is cut off. `/ouija` is throttled per address (300 requests/minute); the claim
route keeps its own, tighter one.

### Scopes

A scope is not a check inside a tool handler: the tools outside it are never
registered on that connection, so a prompt cannot talk a read-only agent into a
write. There is no tool for the account itself — no email, password, session,
export or deletion — in any scope.

| Scope | Tools |
| --- | --- |
| `read` | `list_applications`, `get_application`, `get_stats`, `get_guide` |
| `edit` | read + `create_application`, `find_or_create_application`, `update_application`, `add_milestone`, `update_milestone`, `reopen_application` |
| `full` | edit + `archive_application`, `delete_milestone`, `reset_timeline` (the destructive three) |

**Neither create tool files a duplicate blind.** `create_application` runs the same
check as the add form before it writes: when something matches it returns
`{ created: false, duplicateOf, matchedOn, matches, message }` and writes nothing —
the caller reports it, updates that row, or calls again with `force: true` if the
user wants a second one (the second press on the notice). A rejected or archived
match is described as a legitimate reapplication rather than an error.

**For automation.** A mailbox digest or an auto-applier runs the same finding more
than once, so `find_or_create_application` is the write path for repeatable jobs:
it matches the posting URL first, then company + role (case-insensitive, archived
rows included) and answers `{ created, matchedOn, matches, application }`.

The URL comparison is on a normalized key (`applications.url_key`,
`lib/utils/application-url.ts`): `http`/`https`, `www.`, a trailing slash, the
fragment and tracking parameters (`utm_*`, `gclid`, `gh_src`, …) are noise, while
the parameters that identify the posting are kept and sorted. Rows written before
the column existed carry no key and still match on an identical URL or on company +
role. The lookup and the insert run in **one transaction under a Postgres advisory
lock keyed by the application's identity**, so two simultaneous runs cannot both
find nothing and both write; the lock, not a unique index, is the guarantee —
a constraint would also forbid a user from filing the same posting twice, which is
their call to make. When the write budget is spent the error carries the wait —
`retryAfterSeconds`, and an `Agent` gets "Retry in N seconds" — so a job backs off
for exactly as long as the window has left. The budget itself is the account's
(`RATE_LIMIT_WRITES_MAX`, 300 writes/hour by default, and the knob an operator
raises for a one-off backfill).

**The guide.** A connection is handed a guide to the app itself, not just tool
descriptions: what an application and a milestone are, which statuses are derived
from the timeline and which are the user's terminal decisions, that `displayStatus`
is the one to report, what moves `updatedAt`, how pagination and the write budget
behave, and which actions need confirmation. It also carries the recording rules —
lay out a hiring process the employer actually described, put a rejection in the
comment of the step it happened at, and clear the steps that never happened once an
offer closes the timeline. It is the server's `instructions` at
`initialize` and also callable as `get_guide`, for clients that never surface
instructions — one constant, so the two cannot drift.

`edit` may set a status (`applied`, `interviewing`, `offer`, `rejected`,
`ghosted`) but not `archived`: archiving is the destructive act and lives in
`archive_application`. Every write goes through the same Zod schemas and service
functions as the HTTP routes, and spends the same per-account write budget
(`RATE_LIMIT_WRITES_MAX`, default 300/hour).

### Pairing

The token never has to travel through a chat log. Settings starts a pairing and
prints a code (`XXXX-XXXX`, ten minutes); the code is the only thing that goes
into the conversation.

1. Agent: `POST /pair/claim {"code"}` → `202 {"state":"claimed"}`. The claim is
   bound to the address that made it: any *other* connection presenting the same
   code is answered `409 CLAIMED_ELSEWHERE` and never receives a token, before or
   after approval.
2. The Settings panel sees the claim — with the address and user agent it came
   from — and offers **Approve** / **Deny**. Approving a claim from somewhere you
   do not recognise is approving that stranger's agent.
3. Approval mints nothing on its own: the token is created on the **first
   collection**, with the name and scope chosen when the pairing started, so an
   approval nobody comes back for leaves no orphan credential.
4. Collection repeats while the code lives (up to five handovers of the *same*
   token), because an agent whose scratch directory is wiped between commands
   would otherwise lose it for good.
5. Before approval the claim returns no token at all, and after approval only the
   claiming connection can collect it. An unknown, expired and spent code all
   answer `404`.

A pairing is a row in Postgres, not in the server's memory, because Next.js route
handlers are separately compiled entries: a `Map` shared between the panel's route
and the claim's route is not guaranteed to be one object. Expired pairings are
deleted on the next read of either route.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/ouija` | bearer only | MCP streamable HTTP: `initialize`, `tools/list`, `tools/call`. `GET`/`DELETE` answer `405` — stateless, no stream, no session. Rate limited per address (300/min) |
| GET | `/api/agent/pair` | session | pairings still waiting on this account, with their state |
| POST | `/api/agent/pair` | session | start a pairing: `{ name, scope }` → `{ code, expiresAt }` |
| POST | `/api/agent/pair/claim` | none | the agent's side: `{ code }` → `202 { state:"claimed" }` until approved, then `{ state: "approved", token }`; `409` from any other address; `404` for unknown/expired/spent (rate limited per address) |
| POST | `/api/agent/pair/:code/approve` | session | approve: the claim can collect from now on |
| POST | `/api/agent/pair/:code/deny` | session | drop the pairing; the claim can never collect |
| GET | `/api/agent/tokens` | session | connected agents, without secrets or hashes |
| POST | `/api/agent/tokens` | session | mint a token directly: `{ name, scope }` → `{ token, secret }`, the secret shown once |
| DELETE | `/api/agent/tokens/:id` | session | revoke |

## Auth

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | /auth/login | Email + password sign-in. `Content-Type: application/json` only — anything else is `415 UNSUPPORTED_MEDIA_TYPE`, so a cross-site form cannot mint a session. Rate limited per IP, per account and per process (429 with `Retry-After`) |
| POST | /auth/register | Create account (rate limited, auto sign-in, 409 on duplicate email) |
| POST | /auth/forgot-password | Issue a 1h reset token (no account enumeration — the reply does not wait on the mail round trip; rate limited per IP and per address) |
| POST | /auth/reset-password | Redeem token, change password (invalidates all outstanding tokens and every session) |
| GET | /auth/verify-email?token= | Confirm the address the token was issued *for* (changing the email invalidates outstanding tokens), rate limited per IP |
| POST | /auth/import?mode=merge\|replace | Import an export; the row shape is the create/update schema, so the same caps, URL/domain/email checks and sanitizing apply, and an unverified account is held to `UNVERIFIED_APP_LIMIT` (403 `EMAIL_UNVERIFIED_LIMIT`). `replace` deletes first and therefore needs `X-CSRF-Token` (403 `INVALID_CSRF_TOKEN`). 413 `FILE_TOO_LARGE` / `TOO_MANY_APPLICATIONS` |
| POST | /auth/resend-verification | Resend the verification email (signed-in, per-user rate limited) |
| PATCH | /auth/profile | Update name / email / `patienceLevel`. Changing the email requires `currentPassword` (`400 PASSWORD_REQUIRED`, `401 INVALID_PASSWORD`), resets verification, emails a notice to the old address, and is `409 EMAIL_TAKEN` on a duplicate |
| POST | /auth/change-password | Change password (current password required, rate limited per IP **and** per user; revokes every session) |
| POST | /auth/set-password | Set the first password on an account that has none (session only; rate limited per IP **and** per user; 400 `PASSWORD_EXISTS` if one is already set; revokes every session) |
| POST | /auth/dismiss-password-notice | Acknowledge the "we cleared your password" notice on the dashboard (session; clears the marker) |
| DELETE | /auth/account | GDPR erasure - permanently delete account + all data. Body: `{"csrfToken":"…","password":"…"}` — the token from `GET /auth/csrf` and, for an account that has a password, the password. 403 `INVALID_CSRF_TOKEN`, 400 `PASSWORD_REQUIRED`, 401 `INVALID_PASSWORD` |
| GET | /auth/export | GDPR portability - download all data as JSON |
| GET | /health | Liveness/readiness for a container probe: `ok`, `database`, `config`, `uptimeSeconds`. Public, and deliberately reports no version |

## Examples

Create an application with curl:

```bash
curl -X POST https://ghosted.boo/api/applications \
  -H "Content-Type: application/json" \
  -b session-cookie.txt \
  -d '{"company":"Acme","role":"Engineer"}'
```
