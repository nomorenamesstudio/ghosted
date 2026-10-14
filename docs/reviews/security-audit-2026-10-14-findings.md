# Findings detail — security audit 2026-10-14

Every record below was re-checked by a verifier that did not write it and validated
against `report-schema.json`. `needs_validation` means the trace holds and a decisive
fact remains outside the repository; `rejected` means the trace held but the effect
did not survive the verifier's control. Nothing here is `confirmed`.

## `ghosted.auth.account-delete-unbounded-body-read`

**Verdict:** `rejected` · **Verifier:** verifier-12 · **Title:** DELETE /api/auth/account buffers an unbounded request body before its CSRF check

One authenticated request can drive a container with a modest memory limit toward it; eight auth routes share the pattern.

**Claimed root cause.** The handler awaits req.json() after the session guard and before verifyCsrfToken, with no Content-Length check and no streamed cap; the import route was hardened against exactly this pattern and no shared helper exists.

**Trace**

- `entrypoint` — `app/api/auth/account/route.ts:29`
- `propagation` — `app/api/auth/account/route.ts:31`
- `propagation` — `app/api/auth/account/route.ts:33`
- `sink` — `app/api/auth/account/route.ts:38`

**Evidence**

- `app/api/auth/account/route.ts:33` — the body read does precede the CSRF check
- `middleware.ts:66` — the matcher covers /api/auth/account, so the framework body clone runs
- `node_modules/next/dist/server/config-shared.js:219` — middlewareClientMaxBodySize defaults to 10485760 bytes
- `node_modules/next/dist/server/body-streams.js:85` — the clone is truncated at that limit and the live request is re-pointed at it

**Rejection reason.** parent spot-checked both framework facts (config-shared.js:219 default 10485760; body-streams.js:93 warning; middleware matcher covers /api/auth/account) and confirms the rejection

---

## `ghosted.import.body-cap-chunk-object-amplification`

**Verdict:** `needs_validation` · **Verifier:** verifier-14 · **Title:** The streamed body reader retains one object per read, so the byte cap does not bound memory

A peer framing 5 MB as tiny writes forces millions of one-byte Uint8Array objects while the byte counter never exceeds the limit; the existing over-cap test sends one 6 MB chunk and never exercises this.

**Claimed root cause.** Each resolved read is pushed into a chunks array while the cap accumulates only byteLength, so retained object count follows the peer's chunk framing rather than the byte cap; Buffer.concat then copies the bytes again.

**Trace**

- `entrypoint` — `app/api/auth/import/route.ts:33`
- `propagation` — `app/api/auth/import/route.ts:39`
- `sink` — `app/api/auth/import/route.ts:50`

**Evidence**

- `app/api/auth/import/route.ts:39` — every resolved read is pushed into the chunks array
- `app/api/auth/import/route.ts:43` — the cap accumulates byteLength only
- `app/api/auth/import/route.ts:50` — Buffer.concat then copies the accumulated bytes again

**Blockers**

- Whether Node 22 and Next 15.5 coalesce chunked reads, and any proxy re-framing, are runtime and deployment facts.
- amplification requires Transfer-Encoding: chunked; the same payload with Content-Length coalesced into 16 reads for 1 MiB
- measured on Node 22: 1,000,000 one-byte chunked frames produced exactly 1,000,000 reads and ~259 bytes RSS retained per chunk; projected ~1.3 GiB at the 5 MiB cap

**Ceiling recorded by the verifier.** the Next 15.5.27 adapter that builds request.body is unverified by this verifier, and any deployment proxy that re-frames the body would neutralise the premise; impact also needs a container memory limit below the projection

---

## `ghosted.import.body-cap-unbounded-parse-work`

**Verdict:** `needs_validation` · **Verifier:** verifier-13 · **Title:** The 5 MB body cap does not bound validation work

Transient CPU and allocation well beyond the intended hundred-application scale, reachable by any authenticated account.

**Claimed root cause.** The cap is enforced on bytes while the row-count caps are array-level checks that in Zod 4.4.3 run after every element has been parsed and the output array preallocated, so a 5 MB document of minimal rows forces roughly 190,000 element parses before the single max issue is reported.

**Trace**

- `entrypoint` — `app/api/auth/import/route.ts:67`
- `propagation` — `app/api/auth/import/route.ts:83`
- `propagation` — `lib/services/import.ts:77`
- `sink` — `lib/services/import.ts:43`

**Evidence**

- `app/api/auth/import/route.ts:67` — the cap is enforced on bytes
- `lib/services/import.ts:77` — the row-count cap is an array-level check
- `node_modules/zod/v4/core/schemas.cjs:711` — element parsing runs before array checks, so the count cap cannot short-circuit it

**Blockers**

- Peak memory and CPU are execution facts.
- the hunter's ~190,000 figure describes the mildest fixture; the worst case is ~1,747,620 elements ({} rows, only company and role required), about 9x more

**Ceiling recorded by the verifier.** memory/CPU effect on a shared server, bounded by the 5 MiB body cap; whether one request is fatal depends on the container memory limit, which the repository does not declare

**Measurement.** bounded in-process run against installed zod 4.4.3 with a field-for-field replica of importFileSchema (no target module imported): 194,180 valid rows = 296 ms CPU, +24 MB heap; 1,747,620 empty-object rows = 11.1 s CPU, ~3.23 GB heap, RSS 3.51 GB before ZodError's eager JSON.stringify threw RangeError

---

## `ghosted.import.field-validation-parity-gap`

**Verdict:** `needs_validation` · **Verifier:** verifier-10 · **Title:** Imported fields bypass the create path's caps, URL/email/domain validation and sanitization, and an imported url reaches a client-rendered anchor href

Cap divergence across six fields plus an executable-URL sink: a crafted export file, imported by the victim and clicked, runs script in the victim's authenticated page. React 19's client renderer and CSP 'unsafe-inline' are the two facts that decide whether it executes.

**Claimed root cause.** importFileSchema re-declares the row shape with different limits and without isSafeHttpUrl, normalizeDomain or sanitizeText, so the weaker schema is the effective write contract for those columns and a javascript: url survives to a client-rendered href.

**Trace**

- `entrypoint` — `app/api/auth/import/route.ts:83`
- `propagation` — `lib/services/import.ts:57`
- `propagation` — `lib/services/import.ts:174`
- `propagation` — `lib/services/applications.ts:573`
- `propagation` — `app/api/applications/[id]/route.ts:29`
- `sink` — `components/ApplicationDetailsCard.tsx:39`

**Evidence**

- `lib/services/import.ts:57` — url accepts any scheme with no isSafeHttpUrl refine
- `lib/utils/validation.ts:25` — the create path refines the same field through optionalUrlSchema
- `lib/services/applications.ts:648` — sanitizeText runs on create and update only
- `lib/db/schema.ts:158` — the affected columns are unconstrained text
- `node_modules/react-dom/cjs/react-dom-client.production.js:14453` — installed react-dom rewrites a javascript: href at the client render path, refuting the executable-URL impact

**Blockers**

- Browser behaviour and React's client-side href handling are not observable in this run; the deployed CSP header is a deployment fact.
- the javascript: XSS impact is REFUTED: installed react-dom 19.3.0 rewrites a javascript: href on both render paths (client setProp calls sanitizeURL at :14453/:14504/:14555; the server bundles carry the same pair)
- surviving finding is the write-contract divergence plus a reachable allowlist-free anchor; data:/blob: schemes remain blockers

**Ceiling recorded by the verifier.** data-integrity and contract bypass, not script execution for the payload the hunter chose; parent re-verified the react-dom sanitizer in the installed bundle

---

## `ghosted.import.replace-mode-no-reauth`

**Verdict:** `needs_validation` · **Verifier:** verifier-11 · **Title:** Replace-mode import destroys every application with no server-verified confirmation

An empty applications array wipes the account; the only confirmation is a client checkbox, so in-page script execution can erase the history with one fetch — the threat the account route's own comment treats as in scope.

**Claimed root cause.** The destructive branch is selected by a query parameter and guarded only by requireSessionForWrite; the CSRF helper exists but is imported only by the account-deletion route.

**Trace**

- `entrypoint` — `app/api/auth/import/route.ts:58`
- `propagation` — `app/api/auth/import/route.ts:102`
- `propagation` — `lib/services/import.ts:119`
- `sink` — `lib/services/import.ts:122`

**Evidence**

- `lib/services/import.ts:77` — the schema has a max bound only, so an empty applications array is valid
- `lib/services/import.ts:122` — replace hard-deletes every application of the session user
- `lib/db/schema.ts:193` — milestones cascade from applications
- `app/api/auth/account/route.ts:38` — the only other hard-delete route requires CSRF and a password

**Blockers**

- The prerequisite (script execution on the origin) is not established by this run; no XSS was found in that unit.
- delete sink is import.ts:122 not :120
- only the application history dies, the account survives

**Ceiling recorded by the verifier.** inconsistent-confirmation gap, not cross-site CSRF; import replace is the only hard delete of applications reachable without CSRF or a password

---

## `ghosted.import.unverified-app-limit-bypass`

**Verdict:** `needs_validation` · **Verifier:** verifier-09 · **Title:** POST /api/auth/import bypasses the unverified-account application cap

Any new registrant (registration auto-signs-in with email_verified false) can create thousands of applications in one request instead of 3; deterministic, not a race.

**Claimed root cause.** The cap lives in the applications route rather than in a shared policy layer, and the import path writes the same table without ever reading users.email_verified.

**Trace**

- `entrypoint` — `app/api/auth/import/route.ts:60`
- `propagation` — `app/api/auth/import/route.ts:83`
- `propagation` — `lib/services/import.ts:131`
- `sink` — `lib/services/import.ts:168`

**Evidence**

- `lib/db/schema.ts:79` — email_verified defaults to false
- `app/api/auth/register/route.ts:104` — registration auto-signs-in that unverified account
- `app/api/applications/route.ts:60` — the cap exists only on this route
- `lib/services/import.ts:77` — the import schema alone bounds the count at 5,000

**Blockers**

- Requires ALLOW_REGISTRATION on the deployment.
- the 5000 cap is import.ts:77, not route.ts:83
- the insert is import.ts:168

**Ceiling recorded by the verifier.** up to 5000 own-account applications per request at 300 requests/hour; no cross-account reach

---

## `ghosted/app/api/applications/route.ts:unverified-app-cap-check-then-act`

**Verdict:** `needs_validation` · **Verifier:** verifier-08 · **Title:** The unverified-account application ceiling is enforced non-atomically

An unverified account can exceed UNVERIFIED_APP_LIMIT (default 3) by racing concurrent creates; bounded by the 300/hour write throttle.

**Claimed root cause.** countApplications and createApplication are separate statements with no transaction, lock or constraint spanning them, so parallel POSTs each observe a stale count.

**Trace**

- `entrypoint` — `app/api/applications/route.ts:38`
- `propagation` — `app/api/applications/route.ts:55`
- `propagation` — `app/api/applications/route.ts:61`
- `propagation` — `app/api/applications/route.ts:62`
- `propagation` — `app/api/applications/route.ts:71`
- `sink` — `lib/services/applications.ts:645`

**Evidence**

- `lib/services/applications.ts:624` — countApplications is a bare count with no lock
- `lib/services/applications.ts:640` — the insert transaction contains no cap check
- `lib/db/schema.ts:184` — only a non-unique index on user_id exists
- `lib/services/applications.ts:930` — the FOR UPDATE pattern the fix needs already exists elsewhere in this file

**Blockers**

- Needs a live Postgres to observe the interleaving.

**Ceiling recorded by the verifier.** race only; the import omission is a separate deterministic root cause; the repo already has the FOR UPDATE pattern it needs

---

## `ghosted/availability/account-key-throttle-consumed-before-password-proof`

**Verdict:** `needs_validation` · **Verifier:** verifier-03 · **Title:** The per-account login throttle is consumed before the password is proven

Anonymous, password-independent denial of sign-in for any named account, maintained at roughly one counted request per window per victim after an initial five; undocumented, unlike the global cap which SECURITY.md records.

**Claimed root cause.** consumeAccountAttempt acts as both check and write on the client-supplied address before any credential material is read, and the bucket clears only on a successful compare, so five anonymous attempts against a named address hold its owner refused for the rest of the window.

**Trace**

- `entrypoint` — `app/api/auth/[...nextauth]/route.ts:3`
- `propagation` — `lib/utils/rate-limit.ts:112`
- `propagation` — `lib/utils/rate-limit.ts:68`
- `propagation` — `lib/utils/rate-limit.ts:63`
- `propagation` — `lib/auth.ts:136`
- `sink` — `lib/auth.ts:117`

**Evidence**

- `lib/auth.ts:117` — the account bucket is consumed before the row read and bcrypt
- `lib/auth.ts:123` — the global cap is peeked after it and also refuses unexamined attempts
- `lib/utils/rate-limit.ts:63` — resetAt is anchored at bucket creation, so sustaining a lock costs six requests per window
- `tests/integration/login-throttle.test.ts:57` — the refuse-the-owner behaviour is pinned as intended

**Blockers**

- Replica count and whether an edge overwrites cf-connecting-ip (deployment facts).
- hunter upkeep figure refuted: sustaining a lock costs 6 requests per address per window, 5 billable to the global cap
- breadth bound is about 20 addresses per window before the process-wide cap refuses everyone

**Ceiling recorded by the verifier.** availability only; deliberate and test-pinned refusal of the owner; new uncovered observation: unbounded bucket-map growth

---

## `ghosted/logos-and-avatars:upstream-body-buffered-before-size-cap`

**Verdict:** `needs_validation` · **Verifier:** verifier-15 · **Title:** Upstream image bodies are read into memory in full before the size cap rejects them

Peak memory per request is set by the remote host rather than by the code, on every in-flight route execution, in a deployment that requires a database-backed session.

**Claimed root cause.** Both proxies validate the byte count only after the whole upstream body has been allocated with arrayBuffer(), so the only bound during the read is the 5-second timeout; the same repository implements a streaming cap for request bodies.

**Trace**

- `entrypoint` — `app/logos/[id]/route.ts:64`
- `propagation` — `lib/services/company-logos.ts:84`
- `sink` — `lib/services/company-logos.ts:92`

**Evidence**

- `lib/services/company-logos.ts:92` — the whole body is materialised before acceptUpstream runs
- `lib/services/company-logos.ts:68` — the 64 KiB cap is a predicate over the already-read buffer
- `app/api/auth/import/route.ts:36` — the repository's own streaming cap shows the intended pattern
- `lib/services/gravatar.ts:38` — a third upstream read on the sign-in path shares the shape

**Blockers**

- What the two upstream hosts can deliver inside 5 seconds, and whether an edge caps response bodies.
- a third upstream read shares the shape: lib/services/gravatar.ts:38 on the sign-in path
- the only in-read bound is AbortSignal.timeout(5000); the upstream content-length header is never consulted

**Ceiling recorded by the verifier.** the attacker cannot choose the response size (fixed hosts, only a query parameter varies), so what the hosts can deliver inside 5s and the container memory limit are deployment facts

---

## `lib/auth.ts:jwt.absolute-cap.skip-without-authTime-claim`

**Verdict:** `needs_validation` · **Verifier:** verifier-04 · **Title:** The 7-day absolute session cap is skipped for any token without the authTime claim, and no path stamps it

An actively used session cookie issued before the claim shipped has no absolute lifetime; git history dates the gap to commit 50c2671.

**Claimed root cause.** authTime is stamped only when the jwt callback runs with `user` (sign-in) and the cap is evaluated only when the claim is already a number, so a token minted before the claim existed is re-signed with a fresh 30-day expiry on every use and never reaches the absolute cap.

**Trace**

- `entrypoint` — `lib/auth/current-user.ts:28`
- `propagation` — `lib/auth.ts:344`
- `propagation` — `lib/auth.ts:347`
- `sink` — `lib/auth.ts:351`

**Evidence**

- `lib/auth.ts:344` — authTime is stamped only when the callback runs with user
- `node_modules/.pnpm/@auth+core@0.41.3/node_modules/@auth/core/lib/actions/session.js:28` — the session read invokes the callback without user
- `node_modules/.pnpm/@auth+core@0.41.3/node_modules/@auth/core/jwt.js:58` — encode() rewrites iat/exp on every request
- `node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/jwt_claims_set.js:150` — the 30-day idle bound still applies to a claim-less token

**Blockers**

- How long ago that commit reached the deployment, and whether any pre-upgrade cookie is still in use.

**Ceiling recorded by the verifier.** the 30-day idle window still bounds claim-less tokens; only the absolute bound is lost; population empty on a fresh deployment or after AUTH_SECRET rotation

---

## `lib/auth.ts:jwt.sessionEpoch.claim-less-token-accepted-at-counter-zero`

**Verdict:** `rejected` · **Verifier:** verifier-05 · **Title:** Migration 0014 seeds session_epoch 0 for every existing account, so claim-less tokens that predate credential changes are accepted

A session captured before a pre-deploy password change is honoured after the deploy and stays valid until the next credential change; bounded only by the absolute cap, which the sibling candidate shows is skipped for claim-less tokens.

**Claimed root cause.** The absent-claim branch treats counter 0 as 'nothing was ever revoked', but 0 is the migration default for every pre-existing row, so pre-migration credential changes are unrepresentable and the tokens they should have invalidated are pinned to 0 and kept.

**Trace**

- `entrypoint` — `lib/auth.ts:312`
- `propagation` — `drizzle/0014_adorable_fallen_one.sql:1`
- `propagation` — `lib/auth.ts:333`
- `sink` — `lib/auth.ts:334`

**Evidence**

- `lib/auth.ts:333` — the absent-claim branch refuses only when the counter is above 0
- `drizzle/0014_adorable_fallen_one.sql:1` — the migration seeds 0 with no backfill
- `tests/integration/session-revocation.test.ts:148` — the acceptance at 0 is pinned as intended
- `docs/reviews/pentest-local-2026-10-14.md:243` — the remediation records the choice to sign nobody out

**Rejection reason.** trace holds but impact is nil: HEAD had no revocation at all, so the 0-seed removes nothing; one-time retrospective eviction is documented and test-pinned

---

## `lib/auth/login-throttle.ts:clearLoginFailures:scope-key-mismatch`

**Verdict:** `needs_validation` · **Verifier:** verifier-02 · **Title:** clearLoginFailures deletes the wrong bucket key, so a successful sign-in never resets the per-account window

Six correct-password sign-ins by one account inside a 15-minute window are refused with 429; an attacker's five failures are not cleared by the victim's own successful sign-in; the documented reset-on-success does not exist, and the test written for it cannot fail because it asserts only toBeNull().

**Claimed root cause.** rateLimitSuccess deletes '<scope>:<identity>' while rateLimitAccount creates 'acct:<scope>:<identity>': clearLoginFailures passes the bare scope 'login', so it deletes a key nothing creates and the account bucket keeps counting successes.

**Trace**

- `entrypoint` — `app/api/auth/login/route.ts:73`
- `propagation` — `lib/auth.ts:145`
- `propagation` — `lib/auth/login-throttle.ts:80`
- `propagation` — `lib/utils/rate-limit.ts:120`
- `propagation` — `lib/utils/rate-limit.ts:112`
- `propagation` — `lib/auth.ts:117`
- `sink` — `app/api/auth/login/route.ts:65`

**Evidence**

- `lib/utils/rate-limit.ts:112` — rateLimitAccount prefixes the scope with acct:
- `lib/utils/rate-limit.ts:120` — rateLimitSuccess deletes <scope>:<identity>
- `lib/auth/login-throttle.ts:80` — clearLoginFailures passes the bare scope 'login'
- `app/api/auth/register/route.ts:131` — the sibling reset passes acct:register correctly

**Blockers**

- In-process buckets; the deployment's RATE_LIMIT_MAX decides the threshold.
- impact is availability, not bypass
- the durable defect is that the account's own successes accumulate; at exactly five failures the refusal comes from the separate consume-before-proof candidate

**Ceiling recorded by the verifier.** parent's six-sign-in observation explained but not reproduced by the verifier

---

## `lib/db/schema.ts:company-logos-global-cache-entries-without-owner-binding`

**Verdict:** `rejected` · **Verifier:** verifier-17 · **Title:** The company-logo cache is global and unowned, so one account can seed or fill what another account sees

Cache integrity and shared-store growth, bounded by what the two fixed favicon services return: an attacker cannot inject chosen bytes or read another account's rows, but can pre-seed and inflate the shared region.

**Claimed root cause.** company_logos is keyed by domain alone with no owner, quota or eviction, and resolveCompanyLogo serves a cached row without re-deriving it for the requester, while the domain value is chosen from another account's free text.

**Trace**

- `entrypoint` — `lib/services/import.ts:175`
- `propagation` — `lib/utils/company-domain.ts:223`
- `propagation` — `lib/services/company-logos.ts:244`
- `sink` — `lib/services/company-logos.ts:146`

**Evidence**

- `lib/db/schema.ts:224` — the cache is keyed by domain alone with no owner column
- `lib/services/company-logos.ts:146` — store writes whatever the fixed hosts returned for a caller-supplied domain
- `lib/services/company-logos.ts:230` — the read path serves a cached row with no ownership check
- `lib/utils/company-domain.ts:223` — the cached key comes from caller-chosen fields

**Rejection reason.** cache integrity plus unbounded shared storage of a non-user artifact; documented as intended in docs/API.md:117 and docs/CHANGELOG.md:1566; hardening note (eviction/log growth), not a finding

---

## `lib/services/account.ts:verifyEmail:verification-token-not-bound-to-email-address`

**Verdict:** `needs_validation` · **Verifier:** verifier-01 · **Title:** Email-verification tokens are bound to the account, not to the address they were issued for

An attacker registers with a mailbox they control, changes the account address to a target address that has no account, redeems the OLD token, and then keeps password access to the account that the address's real owner is signed into by Google or LinkedIn.

**Claimed root cause.** The token row carries userId, tokenHash and expiresAt only; verifyEmail sets emailVerified on the account without comparing the address that was current when the token was minted with the address on the row now, and createEmailVerification keeps unexpired unused tokens when it mints a new one.

**Trace**

- `entrypoint` — `app/api/auth/register/route.ts:113`
- `propagation` — `lib/services/account.ts:233`
- `propagation` — `lib/services/account.ts:226`
- `propagation` — `app/api/auth/profile/route.ts:22`
- `propagation` — `lib/services/account.ts:61`
- `propagation` — `app/api/auth/profile/route.ts:26`
- `propagation` — `lib/services/account.ts:271`
- `propagation` — `lib/services/oauth-accounts.ts:133`
- `sink` — `lib/services/oauth-accounts.ts:208`

**Evidence**

- `lib/services/account.ts:226` — purge predicate is usedAt IS NOT NULL OR expiresAt < now, so an unused unexpired token survives a re-issue
- `lib/db/schema.ts:257` — email_verification_tokens has no address column, so the binding gap is structural
- `lib/services/account.ts:271` — redemption sets emailVerified by userId and never reads users.email
- `lib/services/oauth-accounts.ts:133` — attach vs adopt is decided solely by the local emailVerified flag

**Blockers**

- Source-only run; the provider must be configured and registration open (deployment facts).
- address change is profile/route.ts:22 not :11
- token insert is account.ts:233 not :232
- redemption update is account.ts:271 not :270

**Ceiling recorded by the verifier.** no mitigating control found; defect pre-existing from commit 50c2671

---

## `lib/services/company-logos.ts:unbounded-user-supplied-domain-work-and-cache-growth`

**Verdict:** `needs_validation` · **Verifier:** verifier-16 · **Title:** Any account holder can drive unbounded third-party fetches and persistent cache growth through the company domain

One account (or one 5,000-application import) generates up to ten upstream fetches per application and unbounded shared-cache rows; in-flight fetches are capped at 5 per process but the queue and total work are not.

**Claimed root cause.** resolveCompanyLogo runs the candidate/fetch/store pipeline with no per-account or global budget: the domain comes from client-supplied fields (unvalidated through import), each miss fans out to two hosts, and store() writes a row with the image inline, with no route rate limit, no row or byte ceiling and no eviction.

**Trace**

- `entrypoint` — `app/logos/[id]/route.ts:38`
- `propagation` — `app/logos/[id]/route.ts:64`
- `propagation` — `lib/services/company-logos.ts:223`
- `propagation` — `lib/services/company-logos.ts:111`
- `propagation` — `lib/services/company-logos.ts:122`
- `sink` — `lib/services/company-logos.ts:245`

**Evidence**

- `app/logos/[id]/route.ts:64` — client-supplied fields are passed straight into resolveCompanyLogo
- `lib/services/import.ts:58` — the import schema accepts an unnormalized companyWebsite
- `lib/services/company-logos.ts:37` — the only budget constant caps concurrency, not volume
- `lib/services/company-logos.ts:146` — the upsert grows one row per distinct domain with no ceiling or eviction

**Blockers**

- Deployed database growth, replica count and upstream throttling are outside the repository.
- entrypoint is app/logos/[id]/route.ts:38, not :26
- MAX_BYTES is a store-side cap applied after arrayBuffer, not a download cap

**Ceiling recorded by the verifier.** the 5-slot semaphore caps instantaneous concurrency (5 x replicas) but the waiting queue is unbounded; no eviction exists anywhere, so row growth is monotonic

---

## `oauth/provider-email-verification-not-required`

**Verdict:** `needs_validation` · **Verifier:** verifier-06 · **Title:** A provider email is treated as proof of address ownership without evaluating the provider's own verification assertion

If any enabled provider can return an address it has not verified, an attacker's provider identity attaches to a verified local account with no session counter bump and no notice, and the victim's password keeps working.

**Claimed root cause.** classify() decides on provider, providerId and the provider-supplied email only; the signIn gate destructures { user, account } and never sees the ID-token claims that carry email_verified, while token.emailVerified is set true for every OAuth sign-in.

**Trace**

- `entrypoint` — `app/api/auth/[...nextauth]/route.ts:4`
- `propagation` — `lib/auth.ts:175`
- `propagation` — `lib/services/oauth-accounts.ts:124`
- `propagation` — `lib/services/oauth-accounts.ts:133`
- `propagation` — `lib/auth.ts:260`
- `sink` — `lib/services/oauth-accounts.ts:208`

**Evidence**

- `node_modules/.pnpm/@auth+core@0.41.3/node_modules/@auth/core/lib/actions/callback/index.js:66` — the profile carrying email_verified is delivered to signIn and discarded by the app
- `node_modules/.pnpm/@auth+core@0.41.3/node_modules/@auth/core/lib/utils/providers.js:82` — defaultProfile already strips email_verified from user
- `lib/auth.ts:260` — token.emailVerified is forced true for every OAuth sign-in
- `app/api/auth/forgot-password/route.ts:67` — mailbox control already yields a session, which bounds the incremental impact

**Blockers**

- Whether Google or LinkedIn can emit an unverified address is a provider fact; the repository holds no profile override and no ID-token sample.
- entrypoint is route.ts:4 not :1

**Ceiling recorded by the verifier.** with a truthful provider, presenting the victim's address already implies mailbox control and reset-password grants a session, so the attach adds durable silent persistence rather than new authority

---

## `oauth/session-epoch-pinned-from-post-verification-read`

**Verdict:** `needs_validation` · **Verifier:** verifier-07 · **Title:** The revocation counter is pinned from a post-verification database read, so a sign-in overlapping a credential change survives revocation

A credential change committing between verification and minting does not revoke the session that change was meant to evict; repeatable because every successful check clears the account bucket.

**Claimed root cause.** authorize() returns the counter it observed but nothing reads it; the jwt callback re-reads users.session_epoch and, for a freshly minted token with no claim, assigns that later value unchanged, contradicting its own comment.

**Trace**

- `entrypoint` — `app/api/auth/[...nextauth]/route.ts:4`
- `propagation` — `lib/auth.ts:125`
- `propagation` — `lib/auth.ts:136`
- `propagation` — `lib/auth.ts:154`
- `propagation` — `lib/auth.ts:296`
- `propagation` — `lib/auth.ts:313`
- `sink` — `lib/auth.ts:326`

**Evidence**

- `lib/auth.ts:154` — authorize returns the counter it observed and nothing reads it
- `lib/auth.ts:326` — the mint branch assigns the later read
- `lib/auth.ts:296` — an awaited Gravatar fetch widens the window to as much as three seconds
- `tests/integration/session-revocation.test.ts:41` — the helper omits sessionEpoch, so the race is neither pinned nor excluded

**Blockers**

- Needs a database to schedule the bump between the two reads.
- repeatability refuted: the account bucket is never cleared, so about five racing attempts per window
- the window is 0.25-3 s because of the awaited Gravatar fetch

**Ceiling recorded by the verifier.** credentials-specific; the same branch is correct for the OAuth adopt self-bump and any fix must preserve it

---


Filed alongside [security-audit-2026-10-14.md](security-audit-2026-10-14.md), which states the method, the coverage gaps and the recommended fix order.
