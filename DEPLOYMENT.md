# Launch Runbook — Ghosted

Everything needed to take the app from the sandbox to production on Railway,
with a Lost Signals domain, Resend email and Google sign-in. Most steps are
one-time, done in your own accounts; the code is already deployment-ready
(`railway.json` + `scripts/migrate-on-start.mjs` apply migrations on every
deploy).

Replace `<APP_URL>` below with your final app subdomain, e.g.
`https://ghosted.boo`.

---

## 1. Domain

1. Buy a domain for Lost Signals at any registrar (e.g. Namecheap, Cloudflare,
   Porkbun) — something like `lostsignals.studio` or `lostsignals.dev`.
2. Decide the app subdomain: `ghosted.` or `app.` on that domain.

> Note: if you want email from the same domain (e.g.
> `noreply@lostsignals.studio`), pick a domain you can add to Resend — Resend
> will give you DNS records to add at the registrar.

## 2. Email (Resend)

1. Create an account at https://resend.com.
2. **Add your domain** (Domains → Add) — Resend shows DNS records to add at
   your registrar: **MX**, **SPF**, **DKIM**, and optionally **DMARC**.
3. Wait for the domain to verify (usually minutes).
4. Create an **API key** (API Keys → Create) → `RESEND_API_KEY`.
5. Set `EMAIL_FROM` to a sender your domain allows, e.g.
   `Ghosted <noreply@lostsignals.studio>`.
   - Until the domain is verified, `onboarding@resend.dev` only reaches your
     own inbox — fine for testing, not for launch.

## 3. Google sign-in

1. Go to https://console.cloud.google.com → create/select a project.
2. **OAuth consent screen**: set the app name ("Ghosted"), user support email,
   scopes (none beyond basic profile/email).
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://<APP_URL-host>`
   - Authorized redirect URI: `https://<APP_URL-host>/api/auth/callback/google`
4. Copy the Client ID → `AUTH_GOOGLE_ID`, Client secret →
   `AUTH_GOOGLE_SECRET`.
5. (Optional) Same for LinkedIn if you want the LinkedIn button later.

## 4. Railway

1. Sign up at https://railway.app (GitHub login works).
2. **New Project → Deploy from GitHub repo** → select the `ghosted` repo
   (private is fine). Railway builds the checked-in **Dockerfile**
   (`railway.json` sets the builder): full pnpm install (dev deps included,
   which Next needs at build time), `next build`, and a runtime image whose
   command applies migrations then starts Next.js.
3. **Add a Postgres plugin** (New → Database → PostgreSQL). Its
   `DATABASE_URL` is auto-injected into the app's env.
4. **Variables** — set these on the service:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | (auto from the Postgres plugin — override not needed) |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | from step 3 |
   | `RESEND_API_KEY` | from step 2 |
   | `EMAIL_FROM` | `Ghosted <ghosted@lostsignals.studio>` |
   | `NEXT_PUBLIC_APP_URL` | `https://<APP_URL-host>` |
   | `NEXT_PUBLIC_DONATE_URL` | your coffee/patreon page |
   | `NODE_ENV` | `production` |
   | `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MINUTES` | defaults fine (5/15) |
   | `GHOSTED_AFTER_DAYS` | fallback only (per-user Patience level wins) |
5. Deploy. The start command applies the SQL migrations automatically.
6. **Custom domain**: Settings → Networking → Generate Domain
   (`*.up.railway.app`), then **Custom Domain** → add
   `ghosted.yourdomain.com`; Railway shows the CNAME record to create at your
   registrar (e.g. `ghosted  CNAME  <your-project>.up.railway.app`).
7. Done — `https://<APP_URL-host>` is live. Seed data if you want:
   `railway run pnpm db:seed` (dev-only convenience; the demo account has
   316 apps).

## 4b. A staging environment on Railway (and the traps)

The staging environment deploys from the **`staging`** branch, runs the same
Dockerfile, and is where a change is verified before `main` carries it. The
checks that count are in [docs/RELEASING.md](docs/RELEASING.md).

Five things about Railway environments that cost real time to learn:

1. **Services are project-wide, volumes are not.** A service appears in every
   environment, and each environment has its own *instance* of it — but a volume
   can end up attached to instances in two environments. That is how staging
   briefly ran against the **production database** here: same
   `RAILWAY_VOLUME_ID` in both. Before trusting a new environment, compare the
   volume ids:
   `RAILWAY_VOLUME_ID` on the database service in each environment must differ.
   Two Postgres instances on one data directory is a corruption risk, not a
   curiosity.
2. **A Railway Postgres volume must not be the data directory itself.** The
   volume mounts at `/var/lib/postgresql/data`, which contains `lost+found`, and
   `initdb` refuses a non-empty directory — set
   `PGDATA=/var/lib/postgresql/data/pgdata` and let the cluster live one level
   down, the same layout the Postgres template uses.
3. **Stopping an instance is not deleting it.** To keep an instance from ever
   starting again — a staging instance of the production database, say — give it
   a `startCommand` that explains itself and exits (`echo '…'; exit 1`) rather
   than relying on it staying stopped through the next "redeploy all".
4. **A stopped deployment makes the next deploys `SKIPPED`.** After stopping a
   service's deployment, a variable change queues deployments that get skipped;
   an explicit `serviceInstanceDeploy(latestCommit: true)` is what actually
   builds.
5. **Project tokens travel in their own header.** The Railway API wants
   `Project-Access-Token: <token>` (not `Authorization: Bearer`) for a project
   token, and the `projectToken { projectId environmentId }` query is how you
   find out which project and environment a token belongs to.

`NEXT_PUBLIC_APP_URL` is baked into prerendered pages, so it must be set **before**
the build: Railway does pass service variables to the Dockerfile build, verified
by the staging canonical URL matching the staging domain rather than production's.

## 5. Post-launch checklist

- [ ] Legal pages (`/privacy`, `/terms`, `/imprint`) still contain bracketed
      placeholders (address, contact, jurisdiction) — fill with real details
      before going public.
- [ ] Point the donate links at a real page (buy-me-a-coffee / stripe).
- [ ] (Optional) LinkedIn OAuth credentials.
- [ ] Smoke-test: register a real user, verify the confirmation email arrives,
      sign in with Google, create an app.
- [ ] Watch the first deploy's logs for the "Database migrations applied."
      line.

## Local vs prod

- Migrations are committed SQL in `drizzle/` and applied by the start command;
  there is no auto-sync in production.
- Emails without `RESEND_API_KEY` are logged to the console (dev stub).
- The ghosted threshold, rate limits and token TTLs are all env-tunable.
