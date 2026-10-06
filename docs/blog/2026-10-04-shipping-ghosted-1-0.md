# Ghosted 1.0, and the day I nearly pointed staging at production

Ghosted is a job application tracker I built because the worst part of a job hunt
is not the rejection, it is the silence. Today it went live as 1.0.0, and an hour
later 1.1.0, and the honest version of that day includes the part where my
staging environment was quietly talking to my production database.

This is the write-up of what actually happened, in the order it happened, because
the interesting parts are all failures and near-failures rather than the release
itself.

## The upgrade that changed the security story

The release was blocked on a number, and the number was twenty-eight: that many
dependency advisories, two of them critical, nearly all of them in Next.js 14.
There were fixes for the shape of each one — the image optimizer refuses remote
URLs, no AVIF anywhere, `next/image` used nowhere, so the critical RCE was
unreachable — and every one of those mitigations was configuration. Configuration
is a promise about the future that someone has to keep.

So I upgraded to Next 15 and React 19 instead, and the audit went from 28 to 1.
The one that remains is `braces`, it is build-time only, and no released version
fixes it; it is now written into `SECURITY.md` and into the audit's ignore list,
which is to say accepting it is a decision somebody made rather than a number
nobody read.

What actually broke in the upgrade is worth listing, because none of it was
predicted:

- `params` and `searchParams` became promises, so eight route handlers and one
  page had to await them.
- Next stopped emitting `apple-mobile-web-app-capable` in favour of the standard
  name. My layout already had the standard one, so it silently became a
  *duplicate* and the Apple-prefixed tag disappeared entirely — the one iOS reads
  for a standalone home-screen app below 16.4. A test caught this, which is the
  only reason I know.
- A new lint rule flagged my data export link as an internal navigation. It is a
  download; the rule is now disabled at that line with the reason written next to
  it.

And the audit is a blocking CI check now, which is the part that will keep the
number from creeping back.

## The bug the tests could not see

Before any of that, there was a feature I was sure of: an instance seeds an owner
account on first boot and prints a one-time password, and until that password is
replaced the account cannot write anything. Every mocked test passed — the unit
test for the guard, the integration tests for the API refusals, the owner
bootstrap. The container did not: signing in with the generated password worked, and the app
cheerfully ignored the rule, because the claim that says "this password must
change" never made it into the JWT at sign-in.

Every mocked test was right about the code and wrong about the wiring. I added an
end-to-end test that signs in and asserts the redirect, and the lesson is the
boring one: the container is a test environment, and a green suite is evidence
about the suite.

## The near-miss

Here is the part I am glad I found before it mattered.

I created a staging environment on Railway, pointed it at the `staging` branch,
and gave it the variables it needed. Then, before running a single check against
it, I did one thing I had never done before on a new environment: I asked both
environments which database volume they were holding.

They were the same volume. Railway services are project-wide — a service exists
once and appears in every environment — but a volume belongs to one. Somewhere in
the setup, staging had attached itself to production's Postgres data directory
and was running happily against it. Its deploy log said so in plain language:
migrations applied, ready in 281 milliseconds.

Two Postgres processes on one data directory is not a curiosity, it is corruption
waiting for a busy afternoon. What had already happened by then:

- The staging branch's migrations were applied to production's database. They
  were additive, the running production code ignored the new column, and the next
  production deploy would see them as already applied, so the damage was zero —
  but it was not my intention.
- No owner account was created, because the bootstrap deliberately does nothing
  while registration is open, and registration was open.
- For about thirteen minutes, that staging URL was a public, indexable,
  open-registration copy of my application, writing to my production database.
  Google sign-in could not have worked — the staging domain was not a registered
  callback — but anyone who found the URL could have registered an account.

What I did, in order: stopped my own verification run before it touched anything;
stopped the deployment that was serving; pointed the staging app at an
unreachable database so a queued deploy could only fail its boot; gave the
staging instance of the production database a start command that prints why it is
disabled and exits, so no future "redeploy all" can wake it up; and built staging
a database of its own, with its own volume, verified by reading both environments'
service lists.

The cheapest check of the entire day was comparing two UUIDs. No amount of
reasoning about deployment topology would have been as reliable, and the Railway
traps I learned are now written into `DEPLOYMENT.md` rather than into my memory:
that a Postgres volume must not be the data directory itself, because `initdb`
refuses a non-empty mount point; that stopping an instance is not deleting it;
and that Railway quietly marks queued deploys `SKIPPED` after a stop, so the
deploy that looks like it is coming never arrives until you ask for it explicitly.

## Then the release, which was the easy part

With staging on its own database, the release became mechanical, and I made
myself prove each step rather than assume it:

1. Restore drill: dump the database, restore it into a scratch one, compare row
   counts. Every row matched, then the scratch database was dropped.
2. Staging: health reporting a coherent config, the landing served with its own
   canonical URL, `noindex`, a disallowing `robots.txt`, an empty sitemap,
   registration answering 403, the image optimizer refusing remote URLs, and a
   real sign-in as the boot-seeded owner landing on the password change with
   writes refused until it was replaced.
3. Merge, tag, deploy — and verify production in a browser rather than by status
   code: canonical, `og:url`, the analytics script attached after hydration,
   `window.umami` present, the footer credit, zero console errors.

The deploy itself was invisible: the old container served throughout, the
migrations had nothing to do, and the boot log said `Ready in 145ms`.

## What I deliberately did not do

Three refusals, all of them decisions rather than omissions:

- **The landing still says the product is coming soon.** An hour after 1.0 I
  added the build version to the app's footer, and deliberately not to the
  marketing landing, because a public `v1.0.0` badge underneath a "coming soon"
  tile contradicts the sentence above it. The end-to-end test asserts both
  halves, so the next person cannot undo the distinction by accident.
- **Nothing checks for updates.** The footer knows the version it was built
  with and nothing else. An instance that phones home to ask whether it is
  current is not the instance this project promises.
- **No FAQ structured data.** Google restricted FAQ rich results to government
  and health sites in 2023, so the markup would earn nothing visible. The lever
  that does work is the copy itself: I rewrote the answers so each one leads with
  the question somebody is actually searching for, which is also how a person
  reads them.

The GitHub releases are written and sitting as drafts. They get published when
the landing stops saying coming soon, which is my call to make and not a bug.

## What it cost

Three lanes, and only one of them is a bill:

- **Tokens:** about 1,400 logged model calls — roughly 5.8 M uncached input
  tokens, 510 M cached input, 950 K output. The file has the figures to the digit,
  read from the logs rather than remembered here, and they keep moving while the
  work continues.
- **Estimated USD: about $3.14** at the published deepseek-flash rates, split by
  peak and off-peak. With the caveat that makes it honest: the logs only go back
  to 28 September, and the project's first five weeks — 153 of its 186 commits —
  are gone, so the real cost of the build is higher by an unknown amount; and the
  single largest session has timestamps that a log migration evidently rewrote, so
  the true figure for what the harness still remembers is somewhere between
  **$3.10 and $6.10**.
- **The release day itself: $0.0877.** Nine cents for the upgrade verification,
  the staging environment, the restore drill, the merge, the tag, the production
  deploy and the footer line. It was almost entirely deterministic work —
  `curl`, `docker`, an API, a script — with the model used for judgement rather
  than typing.
- **Actual money:** the account balance, sampled for the first time today:
  **$18.00**. Because it is the first sample, it is a baseline and not a
  measurement, and that distinction is written into the file rather than glossed.

The record lives in `docs/COSTS.md`, generated from the session logs by a script
that is part of the repository, alongside the rule that matters: never add up
costs across projects, because logs get lost and a total that under-reports is
worse than no total at all.

## What is next

The FAQ still promises an MCP integration, and it does not exist yet. That is the
next thing worth building: your own agent, with your own key, doing the filing,
while the log stays the tool and the agent stays yours.

Ghosted is MIT-licensed, it self-hosts with three commands, and the whole story
of this branch — including two independent model reviews and their raw
transcripts, the false alarms, and the bugs they did and did not find — is in the
repository.

---

*Ghosted is hand-written and AI-enhanced: the specification, the decisions, the
taste and the final read are mine; the implementation was written with DeepSeek
V4.1 Flash in the DeepSeek Harness, and reviewed by Claude, GPT and GLM before
this release. The cost of all of it is in `docs/COSTS.md`.*
