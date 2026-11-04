# 1. Base
FROM node:24-slim AS base
WORKDIR /app

# 2. Dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# 3. Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client (DATABASE_URL is not used at generate time — only
# needed so prisma.config.ts doesn't throw during schema parsing).
RUN DATABASE_URL=postgresql://build:build@localhost/build npx prisma generate && npm run build

# 4. Runner
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Only copy what the server needs at runtime
COPY --from=builder /app/dist           ./dist
COPY --from=builder /app/node_modules   ./node_modules
COPY --from=builder /app/package.json   ./package.json
COPY --from=builder /app/prisma         ./prisma

# Migrations, and the tool that applies them.
#
# A GitHub runner cannot reach this database — it is private, which is the same thing that stops
# the content crons running there. So migrations are applied on the box, out of this image, where
# the connection already works: the deploy runs `dbmate up` in a throwaway container from this
# tag before the new server container starts. Until 2026-11-04 nothing ran them at all and the
# golf tables simply never existed in production.
#
# TARGETARCH because dev builds arm64 and production amd64; buildx sets it.
ARG TARGETARCH
ARG DBMATE_VERSION=v2.21.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL -o /usr/local/bin/dbmate \
      "https://github.com/amacneil/dbmate/releases/download/${DBMATE_VERSION}/dbmate-linux-${TARGETARCH}" \
 && chmod +x /usr/local/bin/dbmate \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# dbmate's default migrations dir is ./db/migrations, and WORKDIR is /app.
COPY --from=builder /app/db/migrations  ./db/migrations

EXPOSE 4000
ENV PORT=4000

CMD ["node", "dist/server.js"]
