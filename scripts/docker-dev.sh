#!/bin/bash
set -e

# Build and run the app in Docker for testing
# Mounts source files so changes are reflected on restart

# Use podman-compose/podman compose if available, otherwise docker compose
if command -v podman-compose &>/dev/null; then
    COMPOSE="podman-compose"
elif command -v podman &>/dev/null && podman compose version &>/dev/null; then
    COMPOSE="podman compose"
else
    COMPOSE="docker compose"
fi

mkdir -p dist/client/assets

echo "Starting Muninn with $COMPOSE..."
$COMPOSE up --build --remove-orphans "$@"
