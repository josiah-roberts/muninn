#!/bin/bash
set -e

# Build and run the app in Docker for testing
# Mounts source files so changes are reflected on restart

# Use docker compose if available, otherwise podman-compose/podman compose
if command -v docker &>/dev/null; then
    COMPOSE="docker compose"
elif command -v podman-compose &>/dev/null; then
    COMPOSE="podman-compose"
else
    COMPOSE="podman compose"
fi

mkdir -p dist/client/assets

echo "Starting Muninn with $COMPOSE..."
$COMPOSE up --build --remove-orphans "$@"
