# Security review — agent access (MCP), 2026-11-01

**Scope: the agent-access feature only** — the MCP endpoint, the pairing and token
services, the tool catalog, the Settings card and the migration that carries them.
The rest of the app (sessions, login throttle, CSRF, import/export, logos) is out of
scope and covered by `security-audit-2026-10-14*.md` and `pentest-local-2026-10-14.md`.

**Source ref:** `staging` at `354f67a`, plus the uncommitted feature diff (29 paths).

**Method.** A source trace of the 14 feature files (including
`lib/services/applications.ts` only as far as the ownership scope every tool call
depends on), then 12 bounded probes against the local test database, each replayed by
hand and quoted below. An adversarial model pass (Z.ai **GLM Latest**, via OpenRouter)
reviewed the same file set independently; its output is treated as candidate hypotheses
only. Every claim it made was re-checked: one was **rejected on evidence** (the body
size cap, below), one was **re-assessed downward** in detail (the plaintext secret is
real, but its severity rests on the residue, not on the ten-minute window), and its
held list agreed with the probes. No live or hosted instance was touched; no
dependency CVE scan and no Strix run were part of this pass.

## Verdict

The shape holds: a token cannot widen its own scope, cannot reach another account, and
cannot be used as a session. What is wrong is the **pairing handover** — the code is a
shared capability, and the minted secret is left in the database after the pairing that
carries it has expired.

| # | Finding | Severity |
| --- | --- | --- |
| 1 | An expired pairing row keeps the plaintext token, and it still works | **medium** |
| 2 | The code hands the *same* token to any collector after approval | **medium** |
| 3 | `POST /ouija` has no rate limit, so an unauthenticated caller can drive a hash + lookup per request | low |
| 4 | An agent token writes while `must_change_password` is set, a gate the session path enforces | low (latent) |
| 5 | `edit` is kept out of archiving by the tool schema alone; the app schema would accept it | informational |
| 6 | `touched` (last-used throttle) never evicts revoked entries | informational |

Nothing found is critical or high: no unauthenticated code execution, no cross-account
read or write, no authentication bypass. Findings 1 and 2 are the same design decision
seen from two sides — the pairing row is trusted to survive, and it is treated as one
credential rather than one handover — and one fix addresses both.

## 1. An expired pairing row keeps the plaintext token — medium

`agent_pairings.secret` holds the minted bearer token in the clear
(`lib/services/agent-pairings.ts:148-161`, column at
`drizzle/0016_regular_gauntlet.sql:9`). That is deliberate for the ten-minute handover
window, and documented as such. The defect is that **nothing removes it when the window
closes**: `pruneExpired` runs only on `startPairing` and `listPairings`
(`agent-pairings.ts:49-51`), never on the claim path, so a pairing that is never looked
at again keeps its secret indefinitely. The token it holds is not scoped to the pairing
— it is a normal `agent_tokens` row and stays valid until revoked.

Evidence (probe `scratch: stale pairing rows hold live credentials`): a real pairing
minted a token, the row was then aged 24 hours, and the result was

```
stale row secret present: true | token still accepted: 200
```

So a database dump or backup taken *months* later can contain a working agent token, at
whatever scope was chosen — while `agent_tokens` itself stores only SHA-256 hashes.
That contradicts the storage claim in `docs/API.md`, which this review also corrects.

**Smallest fix.** Delete the row in `claimPairing`'s expired branch and call
`pruneExpired()` from `claimPairing` itself, so any claim request clears stale rows even
when Settings is never opened. Regression test: age a row, claim it, assert `404` **and**
`select … where code = ?` returns nothing.

## 2. The code hands the same token to any collector — medium

`claimPairing` returns `pairing.secret` to whoever presents the code after approval,
up to `MAX_HANDOVERS` (5) times (`agent-pairings.ts:140-162`). Nothing binds a handover
to the agent that claimed it, so possession of the code — not possession of the claim —
is what buys the token.

Evidence (probe `anyone holding the code collects the same token`): one claim, owner
approves, the legitimate agent collects, then a second collector collects:

```
collectors same token: true ghosted_agt_XP-RsdqC…
```

Two consequences:

1. A code that leaks during its ten minutes (a screenshot, a pasted prompt, a logged
   chat, a shared clipboard) is enough for an attacker to collect the *same* token after
   the owner approves — and keep it for good. `docs/API.md` and the paddo design it came
   from both claim the opposite: "a leaked code buys an attacker a request the owner
   never approves". That is true only before approval.
2. The panel's human check is not a check: it says "An agent claimed the code" with no
   way to tell the owner's agent from anyone else's (`components/AgentAccessCard.tsx`,
   the claimed-state branch). Claiming first is also not required — the attacker may
   claim second and still collect.

**Smallest fix.** Record the claimer when the state moves to `claimed` — a hash of the
address and user agent is enough — refuse a handover from a different fingerprint, and
show that fingerprint in the panel ("claimed from 203.0.113.9 · curl/8.5"). Re-collection
by the same agent keeps working, which is why `MAX_HANDOVERS` exists. The cheaper
alternative — one handover per pairing — closes it too but re-breaks the case that
motivated five handovers (an agent whose scratch directory is wiped loses the token).

## 3. No rate limit on `POST /ouija` — low

`app/ouija/route.ts:34-46` verifies the bearer token before anything else, which is the
right order, but the verification costs a SHA-256 and one indexed lookup for any request
carrying a well-formed `ghosted_agt_` prefix. There is no throttle, while the public
claim route has one (`app/api/agent/pair/claim/route.ts:28-32`). An unauthenticated
caller can therefore drive one database lookup per request at whatever rate the
deployment accepts. **Fix.** One per-address bucket before `verifyAgentToken`
(`rateLimit(getClientIp(req), "ouija", …)`), sized well above a real client's polling.

## 4. An agent token writes while the password must be changed — low, latent

`requireSessionForWrite` refuses every mutation while `users.must_change_password` is
set (`lib/utils/api.ts:104-110`); the MCP write guard calls `assertWriteBudget` only.
Probe `an existing token still writes while the account must change its password`:
a token minted for a flagged account created an application successfully.

Latent rather than live: `must_change_password` is written in exactly one place, the
owner bootstrap (`scripts/ensure-owner.mjs:90`), for an account created at boot — before
anyone could have paired an agent. **Fix.** Carry the flag into the MCP guard, or refuse
in `verifyAgentToken`, so both write paths enforce the same rule.

## 5. `edit` archiving rests on the tool schema alone — informational

`archive_application` is `full`-only and `update_application`'s `status` enum excludes
`archived` (`lib/mcp/server.ts`, `EDITABLE_STATUSES`). Verified: an edit token sending
`status: "archived"` is rejected by the SDK's argument validation and the application
stays `applied`. But `updateApplicationSchema` itself **accepts** `archived`, so the
single thing standing between an edit agent and an archive is the tool's own schema. One
explicit guard in the handler (`if (input.status === "archived") → refuse`) makes the
scope a rule rather than a schema accident.

## 6. `touched` never evicts — informational

`lib/services/agent-tokens.ts:120` keys the once-a-minute `lastUsedAt` write by token id
and never deletes entries. Bounded by token creation (300 writes/hour), so it is small,
but it only grows. **Fix.** Delete the entry in `revokeAgentToken`.

## Held — attempted, and the code refused

Each line is a probe or a trace result, not an opinion.

| Attempt | Result |
| --- | --- |
| Another account's full token reads/mutates Alice's application (`get`, `update`, `archive`, `reset`, `add/update/delete` milestone) | every call `No such application` / `No such milestone`; row unchanged |
| `update_application` with `status: "archived"` on an edit token | rejected by tool schema (`Invalid option`), status stays `applied` |
| Smuggling `userId` / unknown fields into a tool | stripped by Zod; row owner unchanged |
| Read token calls a write tool | tool not registered — `MCP error -32602: Tool create_application not found` |
| Agent escalates through the app's own API (`POST /api/agent/tokens`, `GET /api/applications` with `Authorization: Bearer`) | `401` both — a bearer token is not a session |
| Another account approves or denies the code | `404` both; its token list stays empty |
| Six concurrent claims | one token, five handovers, sixth `404` — no double mint |
| Deleting the account | token `401`, pairings gone (FK cascade) |
| Guessing a code | 32⁸ ≈ 1.1 × 10¹², 60/min per address, unknown/expired/spent all `404` |
| CSRF against the pairing/mint routes | session cookie is `SameSite=Lax` and the bodies are JSON; `/ouija` is bearer-only and a cross-origin `Authorization` request cannot pass preflight (no CORS headers) |
| Secret in listings, local storage, or the DOM | listing returns no secret/hash; nothing persisted client-side; secret rendered as text |
| Caching | `Cache-Control: no-store` covers `/ouija` (middleware, now asserted in `tests/unit/middleware.test.ts`) |
| Oversized request body | capped by the SDK transport at 4 MiB, streamed, `413` — **this is where the model pass was wrong**; `readJsonBody`'s 64 KB cap is a different layer, not a missing control |
| Token timing oracle | prefix check plus a unique-index hash lookup; no compare loop |
| DNS rebinding | SDK protection is off by default, and it does not matter here: every request needs a valid bearer token, which a hostile page cannot obtain or attach without a preflight |

## Needs validation — deployment facts

- **Plain HTTP on a LAN.** The pairing prompt and the minted config carry a live token
  over plain HTTP if the instance is served that way. Nothing in the repo forces TLS;
  this is the operator's shape (`docs/SELFHOST.md`).
- **`getClientIp` and the claim throttle.** It trusts `cf-connecting-ip`, then
  `x-real-ip`, then the last `x-forwarded-for` entry (`lib/utils/rate-limit.ts:198`). On
  an origin reachable directly, that header is client-chosen — the same limitation the
  login throttle already documents. It matters less here: the code space makes guessing
  hopeless even unthrottled.
- **Proxy forwarding.** `/ouija` must be forwarded like `/api/*`; a proxy that only
  forwards `/` answers 404 and would make the feature look broken rather than insecure.

## Not covered

No live or hosted probing, no TLS/edge behaviour, no hostile-origin browser run against
a deployed instance, no CVE/advisory scan of `@modelcontextprotocol/sdk@1.32.2`, no
Strix run, and no review of code outside the feature. One run does not exhaust this
target.

## Fix order

1 and 2 together (they share the pairing row): prune on claim and delete on expiry,
then bind the handover to the claimer and show it in the panel. 4 and 5 are four lines
each. 3 is one throttle. 6 is one `delete`.

## Resolution — all six applied, 2026-11-01

| # | Fix | Pinned by |
| --- | --- | --- |
| 1 | `claimPairing` prunes every expired row on entry and deletes the row it was handed when it is past its window; the secret therefore cannot outlive the window it belongs to (`lib/services/agent-pairings.ts`) | `agent-access.test.ts` › "deletes an expired pairing, and the token it held with it" |
| 2 | `agent_pairings.claimed_from` / `claimed_agent` (migration `0017`) record who claimed; a handover from another address is `409 CLAIMED_ELSEWHERE` and gets no token; the panel prints "from `<address>` · `<agent>`" so the owner can see a claim that is not theirs | same file › "hands the token to one connection only", and the pairing lifecycle test's rival claim |
| 3 | `POST /ouija` is throttled per address, 300/minute, before the token is looked up (`app/ouija/route.ts`) | same file › "answers 429 to a flood from one address" |
| 4 | `verifyAgentToken` joins the account and carries `must_change_password`; `guardWrite` refuses writes with `403 PASSWORD_CHANGE_REQUIRED`, reads still work (`lib/services/agent-tokens.ts`, `lib/mcp/server.ts`) | same file › "refuses agent writes while the account must choose its own password" |
| 5 | `update_application` refuses `status: "archived"` in the handler as well as in the tool schema | same file › "does not let a full connection archive through a status update" |
| 6 | `revokeAgentToken` deletes the token's `lastUsedAt` marker | — (one line, no observable contract beyond the map itself) |

Two limits remain, and they are deliberate: the address binding is only as good as the
address the deployment can see (a proxy that forwards no `x-real-ip`/`cf-connecting-ip`
makes every client "unknown", which collapses the check), and the pairing secret is still
plaintext in the row for its ten minutes because the handover has to return it. Both are
under "Needs validation" above.
