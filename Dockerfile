# 1. Base
FROM node:24-slim AS base
WORKDIR /app
# Prisma reads the OpenSSL version to pick its query engine, and the slim image ships without
# the `openssl` tool. Without it `prisma generate` fell back to openssl-1.1.x, the container
# needed 3.0.x, and every database call failed at runtime. binaryTargets in schema.prisma pins
# the engines as well; this keeps detection itself honest. The runner stage needs it too.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

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
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Only copy what the server needs at runtime
COPY --from=builder /app/dist           ./dist
COPY --from=builder /app/node_modules   ./node_modules
COPY --from=builder /app/package.json   ./package.json
COPY --from=builder /app/prisma         ./prisma

EXPOSE 4000
ENV PORT=4000

CMD ["node", "dist/server.js"]
