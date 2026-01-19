#!/bin/bash
set -e

# Use podman if available, otherwise docker
if command -v podman &>/dev/null; then
    DOCKER=podman
else
    DOCKER=docker
fi

IMAGE_NAME="arkayos/muninn"
TAG="${1:-latest}"

echo "Pushing image: ${IMAGE_NAME}:${TAG}"
$DOCKER push "${IMAGE_NAME}:${TAG}"

# Also push latest if a specific version was provided
if [ "$TAG" != "latest" ]; then
    echo "Pushing: ${IMAGE_NAME}:latest"
    $DOCKER push "${IMAGE_NAME}:latest"
fi

echo "Push complete!"
