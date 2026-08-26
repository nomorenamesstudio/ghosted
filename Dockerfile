# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
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

# Runtime image: apply migrations, then start Next.js.
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/drizzle ./drizzle
EXPOSE 8080
CMD ["sh", "-c", "node scripts/migrate-on-start.mjs && pnpm start"]
