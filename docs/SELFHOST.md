# Self-hosting Ghosted

Ghosted is a job-application logbook: applications, a timeline per application,
and a section for the ones that went quiet. This guide runs your own copy.

Two shapes, both supported by the same image:

| | Landing page | Who can sign up | Email needed |
| --- | --- | --- | --- |
| **Family / friends** | off | anyone who has the URL | yes |
| **Solo** | off | nobody — one account, created at boot | no |

The hosted instance (`ghosted.lostsignals.studio`) runs a third shape: landing
on, registration open. That is what the defaults do, so a copy that sets nothing
behaves like it.

## 1. What you need

- Docker with the Compose plugin, or Node 20+ and Postgres 16.
- A domain (optional but recommended) if anyone else will use it, so emailed
  links and the canonical origin are right.
- An email provider if others will register: Resend (free tier is plenty), or any
  SMTP server — Postmark, SendGrid, Mailgun, Fastmail, your own Postfix.

## 2. Solo, in three commands

```bash
git clone https://github.com/krisztianhadi/ghosted && cd ghosted
cp .env.example .env
openssl rand -base64 32        # paste into AUTH_SECRET
```

Then set these in `.env`:

```ini
AUTH_SECRET=<the value you just generated>
AUTH_URL=http://localhost:8080
NEXT_PUBLIC_APP_URL=http://localhost:8080
SHOW_LANDING=false
ALLOW_REGISTRATION=false
GHOSTED_USER_EMAIL=you@example.com
```

```bash
docker compose --profile selfhost up -d
docker compose logs app | grep -A2 "owner account"
```

The log prints the generated password once:

```
Created the owner account Haunty <you@example.com> — password: Xy3…
Change it in Settings after signing in.
```

Open <http://localhost:8080>, sign in with that address and password, then change
it in **Settings → Change password**. No email provider is involved: with
registration closed nobody needs a verification link.

## 3. Family or friends

Same as above, except registration stays open and email becomes required:

```ini
SHOW_LANDING=false
ALLOW_REGISTRATION=true
EMAIL_TRANSPORT=resend
RESEND_API_KEY=re_…
EMAIL_FROM="Ghosted <ghosted@yourdomain.com>"
```

`EMAIL_FROM` must be on a domain you control. Verification and password-reset
mail is deliverability-sensitive: set up SPF and DKIM with your provider, or the
mail lands in spam.

The app refuses to start if registration is open in production without a
transport that actually sends, rather than letting sign-ups break one at a time.

### Using SMTP instead of Resend

```ini
EMAIL_TRANSPORT=smtp
SMTP_URL=smtps://user:pass@smtp.example.com:465
EMAIL_FROM="Ghosted <ghosted@yourdomain.com>"
```

One URL covers every provider that speaks SMTP: implicit TLS (`smtps://`) or
STARTTLS (`smtp://`, default port 587), with AUTH PLAIN or AUTH LOGIN.

### No email at all

`EMAIL_TRANSPORT=log` writes each message to the container log instead of sending
it. Perfect for a solo instance or for testing; unusable when other people need
to verify an address.

## 4. Environment

Everything is documented inline in [`.env.example`](../.env.example), which is
the file to copy. The ones that change what the instance *is*:

| Variable | Default | Effect |
| --- | --- | --- |
| `SHOW_LANDING` | `true` | `false` sends `/` to `/login` instead of the marketing page |
| `ALLOW_REGISTRATION` | `true` | `false` closes sign-ups and hides the register form |
| `GHOSTED_USER_EMAIL` | — | the owner account created at boot when registration is closed |
| `GHOSTED_USER_NAME` | `Haunty` | display name for that account |
| `GHOSTED_USER_PASSWORD` | random, logged once | set it for scripted setups |
| `EMAIL_TRANSPORT` | `resend` with a key, else `log` | `resend` \| `smtp` \| `log` |
| `OPERATOR_NAME` / `_EMAIL` / `_URL` | empty | who runs *this* instance; empty means the footer and legal pages say "self-hosted, powered by Ghosted" |
| `SITE_INDEXABLE` | `SHOW_LANDING` | `false` adds `noindex` and a disallowing `robots.txt` |
| `BRAND_TAG` | none, `DIY` when self-hosted | the word after the wordmark |
| `UMAMI_SRC` + `UMAMI_WEBSITE_ID` | empty | analytics; empty means no tracker at all |

## 5. Your data

- **Export** — Settings → *Export my data* gives one JSON file: every
  application, its milestones, notes and dates.
- **Import** — Settings → *Import my data* takes that file back, on this instance
  or another. Merge by default, or tick *Replace everything I have*. Importing
  the same file twice changes nothing the second time.
- **Backups** — the database is the whole story:

  ```bash
  docker compose exec db pg_dump -U ghosted ghosted > ghosted-$(date +%F).sql
  ```

  Restore with `psql` against the same database. Company logos are a cache and
  refetch themselves; nothing else lives outside Postgres.

## 6. Upgrading

```bash
git pull
docker compose --profile selfhost up -d --build
```

Migrations run as part of the container's start command, before the app serves a
request. If one fails, the container exits with the SQL error in
`docker compose logs app` — take a `pg_dump` first, and read the
[changelog](CHANGELOG.md) for anything tagged **Break**.

The running version is on `/api/health`:

```bash
curl -s localhost:8080/api/health
{"ok":true,"version":"0.1.0","database":"up","uptimeSeconds":42}
```

A `503` there means the app is up but the database is not — the usual cause of a
container that "starts but does not work".

## 7. Troubleshooting

- **"Invalid configuration" at start** — the message lists every problem at
  once. A closed instance without `GHOSTED_USER_EMAIL`, an unknown
  `EMAIL_TRANSPORT`, or a transport named but not configured.
- **Nobody can sign in** — with registration closed the account comes from
  `GHOSTED_USER_EMAIL`, and its password is printed **once**, at creation. It is
  never regenerated, so an existing account keeps the password you set. Reset it
  through *Forgot password* if email is configured.
- **Mail never arrives** — check `EMAIL_TRANSPORT` and the container log for the
  active transport line, then the provider's own logs. For SMTP, SPF/DKIM.
- **Emailed links point at localhost** — `NEXT_PUBLIC_APP_URL` (and `AUTH_URL`)
  must be the address people actually visit.
- **Behind a reverse proxy** — terminate TLS at the proxy and forward to port
  8080; set both URLs to the public `https://` origin.

## 8. What self-hosting does not give you

- No admin panel, and no multi-tenant management: an instance is one database,
  and `ALLOW_REGISTRATION` is the whole access policy.
- The MCP integration the landing page promises is not built yet.
- There is no "unlimited plan" to buy or bypass — running your own copy is the
  point.
