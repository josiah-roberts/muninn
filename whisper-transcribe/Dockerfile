FROM docker.io/oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src

# Expose port
EXPOSE 3001

# Start the server
CMD ["bun", "start"]
