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

Request: `{ "company": "Acme", "role": "Engineer", "url": "https://..." }`
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
ghosted), `interviewing`, `offers`, `rejected`, `ghosted` (stale
applied/interviewing, see `GHOSTED_AFTER_DAYS`). Archived apps count nowhere.

## Auth

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | /auth/login | Email + password sign-in (rate limited per IP and per account) |
| POST | /auth/register | Create account (rate limited, auto sign-in, 409 on duplicate email) |
| POST | /auth/forgot-password | Issue a 1h reset token (no account enumeration) |
| POST | /auth/reset-password | Redeem token, change password (invalidates all outstanding tokens) |
| GET | /auth/verify-email?token= | Confirm an email via the emailed token |
| POST | /auth/resend-verification | Resend the verification email (signed-in, per-user rate limited) |
| PATCH | /auth/profile | Update name / email (changing email resets verification; 409 on duplicate) |
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
