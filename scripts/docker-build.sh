#!/bin/bash
set -e

# Use docker if available, otherwise podman
if command -v docker &>/dev/null; then
    DOCKER=docker
else
    DOCKER=podman
fi

IMAGE_NAME="arkayos/muninn"
TAG="${1:-latest}"

echo "Building Docker image: ${IMAGE_NAME}:${TAG}"
$DOCKER build -t "${IMAGE_NAME}:${TAG}" .

# Also tag as latest if a specific version was provided
if [ "$TAG" != "latest" ]; then
    echo "Also tagging as: ${IMAGE_NAME}:latest"
    $DOCKER tag "${IMAGE_NAME}:${TAG}" "${IMAGE_NAME}:latest"
fi

echo "Build complete!"
echo "  - ${IMAGE_NAME}:${TAG}"
if [ "$TAG" != "latest" ]; then
    echo "  - ${IMAGE_NAME}:latest"
fi
