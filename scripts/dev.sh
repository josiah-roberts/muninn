#!/usr/bin/env bash
set -e

SESSION_NAME="muninn-dev"

# Kill anything running on port 3000
if lsof -ti:3000 &>/dev/null; then
  echo "Killing existing process on port 3000..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 0.5
fi

# Check if we're already inside a tmux session
if [ -n "$TMUX" ]; then
  echo "Already in tmux. Running with interlaced output instead..."
  exec bash "$(dirname "$0")/dev-interlaced.sh"
fi

# Check if tmux is available
if command -v tmux &> /dev/null; then
  # Kill existing session if it exists
  tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

  # Create new session with server in first pane
  tmux new-session -d -s "$SESSION_NAME" -n "dev" "bun --watch src/index.ts; read"

  # Split horizontally and run client build
  tmux split-window -h -t "$SESSION_NAME" "bun run dev:client; read"

  # Make panes equal size
  tmux select-layout -t "$SESSION_NAME" even-horizontal

  # Attach to session
  echo "Starting tmux session '$SESSION_NAME'..."
  echo "  Left pane:  Server (bun --watch src/index.ts)"
  echo "  Right pane: Client build (bun run dev:client)"
  echo ""
  echo "Tmux tips:"
  echo "  Ctrl+b, arrow keys - switch panes"
  echo "  Ctrl+b, d - detach (processes keep running)"
  echo "  Ctrl+b, x - kill current pane"
  echo ""
  exec tmux attach-session -t "$SESSION_NAME"
else
  echo "tmux not found. Running with interlaced output..."
  exec bash "$(dirname "$0")/dev-interlaced.sh"
fi
