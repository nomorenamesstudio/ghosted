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
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Runtime image: prod-only dependencies (dev tools stay out of the image),
# run as the unprivileged `node` user.
FROM base AS runner
ENV NODE_ENV=production
# package.json/lockfile must be present before `pnpm prune` can read the
# manifest (otherwise ERR_PNPM_NO_PKG_MANIFEST).
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/node_modules ./node_modules
# Keep only production dependencies — removes eslint, vitest, playwright,
# drizzle-kit, tsx, etc. from the shipped image.
RUN pnpm prune --prod
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/drizzle ./drizzle
# Next.js writes build/runtime cache under .next at runtime (ISR etc.).
RUN chown -R node:node /app
USER node
EXPOSE 8080
CMD ["sh", "-c", "node scripts/migrate-on-start.mjs && pnpm start"]
