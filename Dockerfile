FROM oven/bun:latest
WORKDIR /app

COPY package.json ./
COPY bun.lock ./

ENV CI=true
RUN bun install --verbose

COPY src ./src
COPY tsconfig.json ./

# Build client assets
RUN bun build src/client/main.tsx --outdir=dist/client/assets --minify

CMD ["bun", "src/index.ts"]
