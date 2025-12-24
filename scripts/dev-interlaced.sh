#!/usr/bin/env bash
set -e

# Kill anything running on port 3000 (if not already done by parent script)
if lsof -ti:3000 &>/dev/null; then
  echo "Killing existing process on port 3000..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 0.5
fi

# Colors for distinguishing output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $SERVER_PID $CLIENT_PID 2>/dev/null || true
  wait $SERVER_PID $CLIENT_PID 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "Starting dev servers..."
echo "  [server] bun --watch src/index.ts"
echo "  [client] bun run dev:client"
echo ""

# Start server with prefixed output
(bun --watch src/index.ts 2>&1 | while IFS= read -r line; do
  echo -e "${GREEN}[server]${NC} $line"
done) &
SERVER_PID=$!

# Start client build with prefixed output
(bun run dev:client 2>&1 | while IFS= read -r line; do
  echo -e "${RED}[client]${NC} $line"
done) &
CLIENT_PID=$!

# Wait for both
wait $SERVER_PID $CLIENT_PID
