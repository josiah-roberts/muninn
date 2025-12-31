#!/bin/bash
set -e

# Build and run the app in Docker for testing
# Mounts source files so changes are reflected on restart

mkdir -p dist/client/assets

echo "Starting Muninn in Docker..."
docker compose up --build --remove-orphans "$@"
