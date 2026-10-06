# Releasing

The version lives in `package.json` and is reported by `/api/health`, so an
operator can always answer "what am I running". The release process is short on
purpose: this is a solo project, and a process nobody follows is worse than a
short one.

## Cutting a release

1. **Make sure `staging` is green and verified** — lint, typecheck,
   unit/integration, e2e, and the container job (which builds the image and boots
   the compose stack) — **and** that the Railway staging environment came up on
   the commit you intend to ship: `/api/health` answering `{"ok":true,"config":"ok"}`,
   a sign-in, and one application round-trip. `main` is production; the merge is
   not the first time the code should ever run in the cloud.
2. **Bump the version** in `package.json` (`1.0.0`, `1.0.1`, `1.1.0` …). No tag
   without a bump: `/api/health` reads the same field.
3. **Add the changelog entry.** `docs/CHANGELOG.md`, newest first, under a dated
   `### Feature` / `### Fix` / `### Break` heading. Say what a *user* sees.
4. **Commit and tag**:
   ```bash
   git commit -am "chore(release): 1.0.0"
   git tag -a v1.0.0 -m "1.0.0"
   git push origin main --follow-tags
   ```
5. **Create the GitHub release** from the tag, with the changelog entry as the
   body, and add anything an operator must act on (a new environment variable, a
   migration, a breaking change). A release that silently requires a new variable
   is a support ticket.
6. **Publish the image**, tagged twice so both answers exist:
   ```bash
   docker build --build-arg NEXT_PUBLIC_APP_URL=https://ghosted.boo \
     -t ghcr.io/krisztianhadi/ghosted:1.0.0 -t ghcr.io/krisztianhadi/ghosted:latest .
   docker push ghcr.io/krisztianhadi/ghosted:1.0.0
   docker push ghcr.io/krisztianhadi/ghosted:latest
   ```
   **Prebuilt images bake `NEXT_PUBLIC_APP_URL`** (it is the canonical URL, the
   `og:url` and the JSON-LD `url`). A self-hoster who wants their own domain in
   those places builds their own image — that is what `docker compose up --build`
   does, and it is the documented path.

7. **Sync the release back into `staging`** (`git merge --ff-only main`). The
   version bump makes the two branches differ the moment a release is cut, and
   the staging environment deploys from `staging` — without the merge it keeps
   serving the pre-bump code, which is the quiet drift a staging environment
   exists to prevent.

## What the version number promises

- **`1.0.0`** — the data model is stable: migrations are additive, the JSON
  export/import format is versioned (`EXPORT_VERSION`), and environment variables
  are not renamed.
- **Minor** (`1.1.0`) — new behaviour, no action required to upgrade.
- **Patch** (`1.0.1`) — fixes only.
- **Major** (`2.0.0`) — something an operator must do: a required variable, a
  migration that is not automatic, or an export format the old version cannot
  read.

## The one standing caveat

Between releases, `main` is the supported version, and a self-hosted instance
that runs `main` carries whatever is on it. The upgrade path is
`docker compose --profile selfhost up -d --build`: migrations run at container
start under an advisory lock, and a failed migration exits the container rather
than serving a half-migrated database. Take a `pg_dump` first anyway — that is
what `docs/SELFHOST.md` says, and it is the only backup that exists.
