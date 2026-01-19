FROM docker.io/oven/bun:latest
WORKDIR /app

# Install Claude Code globally (required by claude-agent-sdk)
RUN bun install -g @anthropic-ai/claude-code

COPY package.json ./
COPY bun.lock ./

ENV CI=true
RUN bun install --verbose

COPY src ./src
COPY tsconfig.json ./

# Build client assets
RUN bun build src/client/main.tsx --outdir=dist/client/assets --minify

CMD ["bun", "src/index.ts"]
