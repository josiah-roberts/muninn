FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Development image with hot reload
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
# Source is mounted as volume for hot reload
CMD ["bun", "--watch", "src/index.ts"]

# Production build
FROM base AS prod
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["bun", "src/index.ts"]
