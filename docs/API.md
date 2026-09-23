# API Reference

## Base URL

`https://ghosted.lostsignals.studio/api` (production) or `http://localhost:3000/api` (dev)

## Conventions

- Every route requires an authenticated session (`Auth.js` JWT cookie) and
  scopes all queries to `session.user.id`. Unauthenticated requests get 401.
- Input is validated with Zod; invalid payloads get 400 with a
  `VALIDATION_ERROR` code and per-field details.
- Errors always use the shape:

```json
{ "error": "human message", "code": "MACHINE_CODE", "details": {} }
```

- State-changing endpoints are rate limited per IP and per user (see
  SETUP.md for defaults). Exceeding a limit returns 429 with a
  `Retry-After` header.
- API responses are never cached: `Cache-Control: no-store` is applied to
  all `/api/*` responses (middleware).

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
domain or a full URL, and is stored normalised (`acme.com`); `""` or `null`
clears it. It only feeds the company-logo lookup, where it overrides every
guess. `PATCH /applications/:id` takes the same fields.
Response: `201` with the created application + milestones.

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

Toggle the favourite flag (favourited apps are pinned to the top of lists).

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

## Auth

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | /auth/login | Email + password sign-in (rate limited per IP and per account) |
| POST | /auth/register | Create account (rate limited, auto sign-in, 409 on duplicate email) |
| POST | /auth/forgot-password | Issue a 1h reset token (no account enumeration) |
| POST | /auth/reset-password | Redeem token, change password (invalidates all outstanding tokens) |
| GET | /auth/verify-email?token= | Confirm an email via the emailed token |
| POST | /auth/resend-verification | Resend the verification email (signed-in, per-user rate limited) |
| PATCH | /auth/profile | Update name / email / `patienceLevel` (changing email resets verification; 409 on duplicate) |
| POST | /auth/change-password | Change password (current password required, rate limited) |
| DELETE | /auth/account | GDPR erasure - permanently delete account + all data |
| GET | /auth/export | GDPR portability - download all data as JSON |

## Examples

Create an application with curl:

```bash
curl -X POST https://ghosted.lostsignals.studio/api/applications \
  -H "Content-Type: application/json" \
  -b session-cookie.txt \
  -d '{"company":"Acme","role":"Engineer"}'
```
