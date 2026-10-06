# What building this costs

Three lanes, and only one of them is measured here.

| Lane | What it is for | Cost |
|---|---|---|
| DeepSeek API, through this harness | Everything the agent did: the app, the reviews, the upgrade, the release | **Usage-based** — the numbers below |
| Railway | The hosted instance, the staging environment, two Postgres services | Hobby plan, billed monthly — **not sampled in this file** |
| Domains | `ghosted.boo` and friends | Yearly registration — **not sampled in this file** |

Most side projects have no idea what they cost, and "it felt cheap" is not a
number. So this file keeps three answers, in increasing order of truthfulness:

1. **Tokens** — exact, read from the harness's own session logs.
2. **An estimate in USD** — the published deepseek-flash rates applied to those
   tokens, split by the provider's peak window. An estimate, always.
3. **Actual USD** — the provider's balance, sampled. The only number that is
   money rather than arithmetic. Because the first sample in this project is the
   one below, **everything before it stays an estimate forever**, and that is
   written down rather than quietly upgraded.

## Usage and estimate

Every request the harness makes is logged with a timestamp and a usage object, so
the figures below are read rather than remembered:
`~/.dsh/sessions/--home-k-Code-ghosted--/*/session.v4.jsonl.zstd`.

<!-- usage:start -->
| Session (UTC) | Local (+07) | Turns | Cache-miss in | Cache-hit in | Output | Peak | Off-peak | Est. USD |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-09-28 12:54Z → 13:46Z (f024619b) | 2026-09-28 19:54+07 | 1320 | 4,928,467 | 507,824,000 | 849,300 | $0.2966 | $2.6240 | $2.9206 |
| 2026-09-28 12:55Z → 12:55Z (e5900490) | 2026-09-28 19:55+07 | 1 | 12,481 | 384 | 1,214 | $0.0000 | $0.0026 | $0.0026 |
| 2026-09-28 13:04Z → 13:04Z (5af8f36d) | 2026-09-28 20:04+07 | 2 | 15,281 | 13,568 | 871 | $0.0000 | $0.0029 | $0.0029 |
| 2026-09-28 13:23Z → 13:23Z (1bcba3af) | 2026-09-28 20:23+07 | 2 | 15,257 | 13,696 | 1,578 | $0.0000 | $0.0033 | $0.0033 |
| 2026-09-28 13:37Z → 13:37Z (e9157735) | 2026-09-28 20:37+07 | 2 | 13,268 | 16,128 | 3,197 | $0.0000 | $0.0040 | $0.0040 |
| 2026-09-30 02:58Z → 02:58Z (78036e3c) | 2026-09-30 09:58+07 | 2 | 15,815 | 13,952 | 822 | $0.0058 | $0.0000 | $0.0058 |
| 2026-09-30 08:59Z → 09:00Z (e6103a79) | 2026-09-30 15:59+07 | 3 | 31,695 | 34,688 | 4,894 | $0.0156 | $0.0000 | $0.0156 |
| 2026-09-30 09:04Z → 09:04Z (672e166b) | 2026-09-30 16:04+07 | 1 | 12,981 | 384 | 1,020 | $0.0051 | $0.0000 | $0.0051 |
| 2026-09-30 09:35Z → 09:35Z (d8753dec) | 2026-09-30 16:35+07 | 3 | 31,512 | 34,432 | 4,363 | $0.0149 | $0.0000 | $0.0149 |
| 2026-09-30 09:43Z → 09:44Z (c78bd54e) | 2026-09-30 16:43+07 | 2 | 14,988 | 14,464 | 2,364 | $0.0074 | $0.0000 | $0.0074 |
| 2026-09-30 09:49Z → 09:49Z (bb2f1aaf) | 2026-09-30 16:49+07 | 2 | 12,640 | 15,104 | 2,304 | $0.0066 | $0.0000 | $0.0066 |
| 2026-09-30 11:05Z → 11:05Z (c70c8e41) | 2026-09-30 18:05+07 | 2 | 15,677 | 14,592 | 1,554 | $0.0000 | $0.0033 | $0.0033 |
| 2026-09-30 11:18Z → 11:18Z (d19a91d0) | 2026-09-30 18:18+07 | 3 | 31,768 | 33,792 | 4,306 | $0.0000 | $0.0075 | $0.0075 |
| 2026-09-30 11:43Z → 11:43Z (926e6f9f) | 2026-09-30 18:43+07 | 2 | 15,869 | 14,336 | 1,509 | $0.0000 | $0.0033 | $0.0033 |
| 2026-09-30 12:10Z → 12:10Z (c1f8cde0) | 2026-09-30 19:10+07 | 3 | 31,350 | 32,768 | 4,073 | $0.0000 | $0.0072 | $0.0072 |
| 2026-09-30 12:28Z → 12:29Z (65ea1bf1) | 2026-09-30 19:28+07 | 3 | 15,602 | 30,336 | 1,629 | $0.0000 | $0.0034 | $0.0034 |
| 2026-09-30 12:36Z → 12:36Z (830ebd9d) | 2026-09-30 19:36+07 | 1 | 12,562 | 384 | 2,451 | $0.0000 | $0.0034 | $0.0034 |
| 2026-09-30 12:46Z → 12:46Z (3e686df4) | 2026-09-30 19:46+07 | 2 | 15,330 | 13,568 | 892 | $0.0000 | $0.0029 | $0.0029 |
| 2026-09-30 13:27Z → 13:27Z (6d92ac9c) | 2026-09-30 20:27+07 | 2 | 15,731 | 13,952 | 681 | $0.0000 | $0.0028 | $0.0028 |
| 2026-09-30 14:12Z → 14:12Z (2baa2c95) | 2026-09-30 21:12+07 | 3 | 31,120 | 32,256 | 3,711 | $0.0000 | $0.0070 | $0.0070 |
| 2026-09-30 14:27Z → 14:27Z (07289f5a) | 2026-09-30 21:27+07 | 3 | 31,840 | 32,768 | 2,872 | $0.0000 | $0.0066 | $0.0066 |
| 2026-10-01 11:28Z → 11:28Z (6f915d2a) | 2026-10-01 18:28+07 | 2 | 13,260 | 14,976 | 1,659 | $0.0000 | $0.0030 | $0.0030 |
| 2026-10-01 12:31Z → 12:31Z (43a7a3b9) | 2026-10-01 19:31+07 | 3 | 4,201 | 45,824 | 3,204 | $0.0000 | $0.0027 | $0.0027 |
| 2026-10-01 12:35Z → 12:35Z (822a6737) | 2026-10-01 19:35+07 | 2 | 15,484 | 14,976 | 1,893 | $0.0000 | $0.0035 | $0.0035 |
| 2026-10-01 13:33Z → 13:33Z (dc8ab53d) | 2026-10-01 20:33+07 | 1 | 6,231 | 128 | 1,594 | $0.0000 | $0.0019 | $0.0019 |
| 2026-10-01 13:34Z → 13:34Z (9f89147b) | 2026-10-01 20:34+07 | 1 | 13,190 | 384 | 2,602 | $0.0000 | $0.0035 | $0.0035 |
| 2026-10-01 13:47Z → 13:47Z (60f126ad) | 2026-10-01 20:47+07 | 1 | 12,623 | 384 | 870 | $0.0000 | $0.0024 | $0.0024 |
| 2026-10-04 05:02Z → 05:02Z (39bd5a77) | 2026-10-04 12:02+07 | 4 | 31,910 | 51,968 | 4,298 | $0.0000 | $0.0075 | $0.0075 |
| 2026-10-04 05:18Z → 05:18Z (9d5708c5) | 2026-10-04 12:18+07 | 3 | 31,234 | 31,360 | 2,631 | $0.0000 | $0.0064 | $0.0064 |
| 2026-10-04 05:30Z → 05:30Z (fc615bc4) | 2026-10-04 12:30+07 | 3 | 15,721 | 31,744 | 2,123 | $0.0000 | $0.0037 | $0.0037 |
| 2026-10-04 06:10Z → 06:10Z (098239c3) | 2026-10-04 13:10+07 | 4 | 31,815 | 52,992 | 4,934 | $0.0000 | $0.0079 | $0.0079 |
| 2026-10-04 06:39Z → 06:40Z (81d4bb97) | 2026-10-04 13:39+07 | 3 | 31,844 | 34,304 | 4,447 | $0.0000 | $0.0075 | $0.0075 |
| 2026-10-04 10:29Z → 10:30Z (b2e7c26d) | 2026-10-04 17:29+07 | 4 | 32,283 | 70,656 | 4,607 | $0.0000 | $0.0078 | $0.0078 |
| 2026-10-04 11:03Z → 11:03Z (18c976f7) | 2026-10-04 18:03+07 | 4 | 32,439 | 53,248 | 4,669 | $0.0000 | $0.0078 | $0.0078 |
| 2026-10-04 11:41Z → 11:41Z (2de362e8) | 2026-10-04 18:41+07 | 3 | 31,581 | 31,616 | 2,971 | $0.0000 | $0.0066 | $0.0066 |
| 2026-10-04 11:47Z → 11:47Z (d675a0f8) | 2026-10-04 18:47+07 | 3 | 15,192 | 32,384 | 3,179 | $0.0000 | $0.0043 | $0.0043 |
| 2026-10-04 12:04Z → 12:04Z (b0b160dd) | 2026-10-04 19:04+07 | 3 | 32,117 | 32,896 | 2,758 | $0.0000 | $0.0066 | $0.0066 |
| 2026-10-04 12:46Z → 12:46Z (f7a696ec) | 2026-10-04 19:46+07 | 3 | 31,761 | 32,896 | 3,501 | $0.0000 | $0.0070 | $0.0070 |
| 2026-10-04 13:12Z → 13:12Z (ac408a4f) | 2026-10-04 20:12+07 | 3 | 32,047 | 35,328 | 5,323 | $0.0000 | $0.0081 | $0.0081 |
| 2026-10-04 13:26Z → 13:26Z (7fe27b7f) | 2026-10-04 20:26+07 | 2 | 14,890 | 13,312 | 1,723 | $0.0000 | $0.0033 | $0.0033 |
| 2026-10-04 13:42Z → 13:42Z (a8c676dc) | 2026-10-04 20:42+07 | 2 | 15,955 | 14,464 | 1,331 | $0.0000 | $0.0032 | $0.0032 |
| **Total** | | **1,418** | **5,767,012** | **508,795,392** | **955,922** | **$0.3521** | **$2.7889** | **$3.1411** |

_Estimated from the published deepseek-flash rates, peak and off-peak; generated 2026-10-04 by `node scripts/usage-report.mjs --write`._
<!-- usage:end -->

### What this number is not

Four caveats, because a total that hides its assumptions is worse than no total:

1. **The logs only go back to 2026-09-28.** The project's first five weeks —
   2026-08-23 to 09-27, and 153 of its 186 commits — predate them. The real cost
   of building this is higher by an unknown amount, and no arithmetic here can
   recover it. A cross-project total would under-report for the same reason.
2. **Cache reads dominate.** 507 M of the 513 M input tokens are cache hits,
   which is why the token total says nothing about price on its own: those are
   billed at a fiftieth of a cache miss, and they are what makes a long session
   affordable.
3. **One session is timestamped implausibly.** The 2026-09-28 session accounts
   for $2.93 of the total, and its 1,314 usage rows all fall inside 51 minutes —
   on a day that produced two commits. Those times were evidently rewritten by a
   log migration. The peak/off-peak split (and therefore the estimate) rests on
   them, so if that work actually ran inside the provider's peak window the same
   tokens cost twice as much: **the honest range for the whole record is roughly
   $3.10–$6.10**, not a single figure.
4. **Chinese public holidays are not modelled**, and the peak window here is
   translated to `+07`: 08:00–11:00 and 13:00–17:00 local, Monday to Friday.

## Cost per feature

The block boundaries come from the session log's own round markers, and the
block-to-feature mapping is maintained by hand — the log knows when a round
started and never what it built. In this project that mapping is deliberately
left blank: the only session with round markers is the implausible one from
caveat 3, so attributing its rounds to features would invent 70% of the cost of
the project. The table is kept, unattributed, because the shape of it is still
information: one round carries most of the build.

<!-- blocks:start -->
| Block | What it built | Turns | Tokens | Est. USD | Share |
|---|---|---:|---:|---:|---:|
| 12:54–12:57Z (19:54+07) | Unattributed (the only session with round boundaries — see docs/COSTS.md) | 401 | 96,004,716 | $0.6713 | 23% |
| 12:57–13:05Z (19:57+07) | Unattributed (same session, round 2) | 36 | 16,909,788 | $0.0684 | 2% |
| 13:05–13:13Z (20:05+07) | Unattributed (same session, round 3) | 43 | 21,788,710 | $0.0843 | 3% |
| 13:14–13:20Z (20:14+07) | Unattributed (same session, round 4) | 30 | 16,080,644 | $0.0620 | 2% |
| 13:21–13:46Z (20:21+07) | Unattributed (same session, round 5) | 810 | 362,817,909 | $2.0346 | 70% |
| **Total** | | **1,320** | **513,601,767** | **$2.9206** | |

_Attributed by goal-round boundaries in the main session (f024619b); the short side sessions add $0.2204 more._
<!-- blocks:end -->

## Actual money

The provider has no per-day spend endpoint — `/user/balance` is the only account
endpoint that exists — so the balance is sampled and differenced instead. This is
the lane that can be wrong in the other direction: a balance can move because of
another project or another machine, which is why every row carries the note that
was written when it was taken.

<!-- ledger:start -->
| Recorded (UTC) | Balance | Change | Note |
|---|---:|---:|---|

_Only one balance recorded so far, so there is nothing to subtract yet. Run `--balance` again after the next block of work._
<!-- ledger:end -->

## The reading

Archaeology, not effort. What the numbers say about this build:

- **The release day cost about nine cents.** 2026-10-04 — the Next 15 upgrade,
  the staging environment, the restore drill, the merge, the tag, the production
  deploy, the footer version line and 1.1.0 — came to **$0.0877**. That day was
  almost entirely deterministic work: `curl`, `docker`, the Railway API, `grep`,
  one script at a time, with the model used for judgement rather than throughput.
- **Understanding costs more than writing.** The expensive block is the earliest
  one, where the cost is not typing code but reading libraries carefully —
  Auth.js internals, Next's prerender boundary, Drizzle's migration journal. The
  reviews that found real bugs were cheap per finding; the ones that found
  nothing still had to be paid for, and that is the correct price of knowing the
  good news is real.
- **The cheapest check was worth the most.** The near-miss of the day — a staging
  environment pointed at the production database — was caught by comparing two
  `RAILWAY_VOLUME_ID` values through an API query that cost nothing. No amount of
  reasoning about deployment shape would have been as reliable, or as cheap, as
  asking the two systems what volume they were holding.
- **The bug that survived the tests cost nothing to fix and everything to miss.**
  The forced password change worked in every mocked test and not in the
  container, because the claim never reached the JWT at sign-in. Reading the
  code was the cheap part; the expensive part was believing the green suite.

The method is packaged as the `project-costs` skill: same file shape, same
script, copied into the project rather than called from the skill directory, so
this repository still makes sense if the skill changes.
