# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
# Pin pnpm deterministically — corepack can resolve "latest" (11.x) when the
# packageManager field is absent, and pnpm 11 needs node:sqlite (Node 22.5+).
# Node 22 ships with npm, so install the pinned version directly.
RUN npm install -g pnpm@10.12.1
WORKDIR /app

# Install ALL dependencies (dev deps included — Next.js needs tailwindcss
# and friends at build time; Nixpacks' prod-only install breaks the build).
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build the production bundle.
FROM base AS build
# The public origin is inlined into prerendered pages (canonical, og:url,
# JSON-LD), which is why it arrives as a build argument rather than only as a
# runtime variable. Compose passes it from .env.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost:8080}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Fails the build if a page that reads the environment got prerendered (or the
# landing stopped being prerendered). See the script for why this is checked
# here rather than in a workflow nobody runs.
RUN pnpm build && node scripts/assert-build-shape.mjs

# Runtime image: the standalone server, run as the unprivileged `node` user.
#
# Every COPY uses --chown rather than a trailing `chown -R`: a recursive chown
# rewrites the whole tree into a new layer (measured: 764 MB of duplicate
# node_modules), and ownership is cheaper to set at copy time.
FROM base AS runner
ENV NODE_ENV=production
# Next's standalone server binds `process.env.HOSTNAME`, and Docker sets that to
# the container's hostname — so it has to be told explicitly to listen on all
# interfaces.
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# The traced server: server.js plus only the modules it actually imports.
COPY --from=build --chown=node:node /app/.next/standalone ./
# Client bundles and other static output are not part of the trace.
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Static assets (favicon, og.png, the landing captures) are served from public/.
COPY --from=build --chown=node:node /app/public ./public
# Migrations and the scripts that run them before the server starts. The scripts
# are plain Node, so they resolve their own imports from disk — and the standalone
# trace only carries what `server.js` needs (the app's own dependencies are
# bundled into the server chunks). Trailing slashes make BuildKit follow pnpm's
# symlinks into the store and copy the packages themselves, which is ~15 MB
# against the ~800 MB a full node_modules copy would cost.
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules/drizzle-orm/ ./node_modules/drizzle-orm/
COPY --from=build --chown=node:node /app/node_modules/postgres/ ./node_modules/postgres/
COPY --from=build --chown=node:node /app/node_modules/bcryptjs/ ./node_modules/bcryptjs/
# Keep this import list in step with the imports in `scripts/*.mjs`; if one is
# missing the image builds and then crash-loops, which is a worse way to find out.
RUN node --input-type=module -e "await Promise.all(['drizzle-orm/postgres-js/migrator','postgres','bcryptjs'].map((m) => import(m))); console.log('boot-script dependencies resolve');"

USER node
EXPOSE 8080
CMD ["sh", "-c", "node scripts/migrate-on-start.mjs && node server.js"]
