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

EXPOSE 4000
ENV PORT=4000

CMD ["node", "dist/server.js"]
