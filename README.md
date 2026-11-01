# Ghosted — A Free, FOSS Job Tracker

[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge)](CONTRIBUTING.md)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge)](https://nextjs.org)
[![CI](https://img.shields.io/github/actions/workflow/status/nomorenamesstudio/ghosted/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/nomorenamesstudio/ghosted/actions/workflows/ci.yml)

![The Ghosted social card: the headline "Ghosted, a free, open-source job tracker", the hero subhead, and the app's own application cards floating beside two ghost mascots](docs/assets/social-preview.jpg)

**A free, open-source job tracker that keeps every application and interview on
one timeline — and gives the ones that went quiet a section of their own.**

Hosted at **[ghosted.boo](https://ghosted.boo)**. Self-host it with Docker and
your own Postgres, or use the hosted instance. No paid tier, no ads, no AI
reading your mail.

## Why this exists

Every job tracker I tried was a spreadsheet, an inbox, or somebody's subscription
funnel. Ghosting and hundreds of applications are the baseline of looking for
work now, and the applications that go silent are exactly the ones you forget
first: no rejection, no reply, nothing.

A friend applied to more than 500 places before me and had nothing encouraging to
report. I started my own hunt in late August 2026, logged the first real
application on 3 September, and it ghosted me too. So the quiet ones got their own
section, and a stalled hunt became something I could see.

## What it does

| | |
| --- | --- |
| **A board and a list** | The same applications two ways. Drag cards between stages, or read them as sections that scroll. |
| **Ghosted, automatically** | An application that has not moved for ten days leaves its stage and joins the ghosted ones. You set the pace. |
| **One timeline per application** | Five rounds by default, extendable and reorderable. Finishing a round advances the status; rejected, archived and offer stay in your hands. |
| **Everything exported** | JSON export any time, import into an existing account, and account deletion that actually deletes. |
| **Search, filter, favorites** | Find by company or role, filter by status, pin the ones you care about, and undo an archive. |
| **Theme, keyboard, screen reader** | Follows your device by default, or pin light or dark in Settings. Usable without a mouse, readable at 200% zoom. The end-to-end suite runs axe on every page, in both themes. |
| **An agent you stay in charge of** | Ghosted serves an MCP server, so your own AI agent can read, edit, or (if you allow it) archive and reset. Scope is picked per pairing, and no scope reaches your account. |
| **Your own instance** | One container and a Postgres. Two environment flags decide whether it is a solo instance or a family one. |

![The whole board on a desktop: the app bar with search, sort and Add application, then every column populated — applied, interviewing, offers, ghosted and rejected — with cards showing company, role, the last round, how long ago it moved and a progress bar tinted by status](docs/assets/board.jpg)

### One application, opened

![The application page for a Senior Product Designer role at Jobber: the timeline runs Application (done, dated), Talent Team Interview, Portfolio Review, Functional Whiteboard Exercise, Cross-Functional Interview and Offer/Decision, with the Talent Team Interview step open in an editor showing its title, status, date and comment. Beside the timeline, a details card carries the status, the job posting URL, the company website, the contact and the notes.](docs/assets/detail.jpg)

The board is the overview; this is what it keeps — everything a spreadsheet would lose.

- **The timeline is the process itself** — one row per round, in order, dated where it
  actually happened. This one was read off the posting: five rounds, each with its length in
  the step's comment, instead of the five defaults every application starts with.
- **The open step is the editor** — title, status (`pending`, `done`, `skipped`), date and a
  comment. **Save & mark done** stamps the date and advances the status for you (applied →
  interviewing → offer), so the board is never a separate thing you update. Rejected and
  archived stay your call.
- **The card on the right is the job** — posting URL, the employer's own site (where the
  logo comes from), a contact, and notes with the salary band here.
- **Add milestone** handles a process that grows — and an agent can write all of this from a
  posting or an email over MCP.

## Quick start

```bash
git clone https://github.com/nomorenamesstudio/ghosted && cd ghosted
cp .env.example .env      # set AUTH_SECRET: openssl rand -base64 32
docker compose up -d      # Postgres
pnpm install && pnpm db:migrate && pnpm db:seed
pnpm dev                  # http://localhost:3000 — demo@example.com / password123
```

Self-hosting is the same image with different flags:

```bash
docker compose --profile selfhost up -d
```

Migrations run at container start under an advisory lock, and a failed migration
exits the container instead of serving a half-migrated database. Full walkthrough,
environment reference, email options, backups and upgrades:
[docs/SELFHOST.md](docs/SELFHOST.md).

## How it works

```
        ┌───────────────────────────────────────┐
 you ──►│  Next.js 15 app  (board · list · one  │
        │  timeline per application)            │
        └──────────────────┬────────────────────┘
                           │  Drizzle ORM
                 ┌─────────▼──────────┐
                 │     PostgreSQL     │
                 │  applications      │
                 │  milestones        │
                 │  users, sessions   │
                 └────────────────────┘

 status  =  derived from milestones + your patience window
 ghosted =  no movement for 10 days (per-account setting)
```

One Postgres holds everything. Self-hosted, that database is yours; on the hosted
instance it is mine, and it leaves with you as JSON.

## Working with an agent

Ghosted runs no model of its own, but it does serve an MCP server — at `/ouija`,
because you are talking to the quiet ones — so the agent you already use can do
the typing. Settings → **Agent access**: name it, pick a scope —
read only, read and edit, or full access with the destructive tools — then **Pair
an agent**. Ghosted prints a short code and a prompt; paste the prompt into your
agent, approve it in Settings, and the token goes straight to the agent. It never
passes through the chat log.

```json
{ "mcpServers": { "ghosted": { "type": "http", "url": "https://<host>/ouija",
  "headers": { "Authorization": "Bearer ghosted_agt_…" } } } }
```

It is built to be dropped into a workflow you already run: an agent that reads your
mailbox can file what it finds (`find_or_create_application` matches the posting URL,
then company and role, so a repeated run updates instead of duplicating), move a
timeline along, and leave the rest alone. Ghosted is the logbook, not the bot.

What no scope can touch: your email, your password, your sessions, exporting and
deleting the account. Connected agents are listed in Settings with their scope and
last use, and revoking one cuts it off on its next request.

## Built with AI

Ghosted is hand-written and AI-enhanced. The architecture, design and product
decisions are mine; the AI wrote and refactored much of the code, and every change
was read, tested and committed by hand. Mostly DeepSeek V4 and V4.1 Flash in
DeepSeek Harness, with GLM-5.3 running the security passes. Code a machine wrote is
still code a human is accountable for.

## FAQ

### Is Ghosted really free?

Yes. No paid tier, no ads, nothing about your hunt is sold. Job hunting already
costs money and time, so charging rent on the logbook never made sense.

### Why is there no AI in Ghosted?

Ghosted ships no model, no API key and no token bill: it writes nothing for you,
applies to nothing for you and reads no mailbox. It knows only what you type into
it — or what the agent you chose to connect asks it to store, through the MCP
server you pair with a scope.

### Can I self-host it?

Yes. One container plus a Postgres, everything else in environment variables. No
prebuilt image ships on purpose: the app bakes your domain into its pages at build
time, so you build it yourself with Docker Compose.

### How does it decide an application went quiet?

Ten days without movement, by default, and you set your own pace per account. It is
a nudge rather than a verdict — anything you have touched recently stays put.

### Who built it?

K, at [No More Names Studio](https://nomorenames.studio). Ghosted started during my
own hunt in 2026 and grew out of whatever was missing while I logged applications.

### What's the catch?

There is none. No funding, no scaling, no exit strategy, no data harvesting. The
logbook stays the size of a logbook on purpose.

## Contributing

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) — it covers local setup, the test suites
   and what gets merged.
2. Open an issue for what breaks, or a pull request for what you would rather fix.
3. Self-host it and report how it went on your machine. That report is the most
   useful thing you can send.

Ghosted is simple on purpose: a pull request is merged when it respects the scope of
the project, and a model-drafted one is welcome as long as you read it first.

## Documentation

[Setup](docs/SETUP.md) · [Self-hosting](docs/SELFHOST.md) ·
[API](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Changelog](docs/CHANGELOG.md) · [The story](docs/STORY.md) ·
[Costs](docs/COSTS.md) · [Releasing](docs/RELEASING.md) ·
[Reviews](docs/reviews/) · [Security](SECURITY.md) · [Docs index](docs/INDEX.md)

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, self-host it.

[![Star this repo](https://img.shields.io/github/stars/nomorenamesstudio/ghosted?style=for-the-badge)](https://github.com/nomorenamesstudio/ghosted)

Built by [K](https://github.com/nomorenamesstudio) |
[nomorenames.studio](https://nomorenames.studio)
