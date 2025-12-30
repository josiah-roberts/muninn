#!/bin/bash
set -e

IMAGE_NAME="arkayos/munnin"
TAG="${1:-latest}"

echo "Building Docker image: ${IMAGE_NAME}:${TAG}"
docker build -t "${IMAGE_NAME}:${TAG}" .

# Also tag as latest if a specific version was provided
if [ "$TAG" != "latest" ]; then
    echo "Also tagging as: ${IMAGE_NAME}:latest"
    docker tag "${IMAGE_NAME}:${TAG}" "${IMAGE_NAME}:latest"
fi

echo "Build complete!"
echo "  - ${IMAGE_NAME}:${TAG}"
if [ "$TAG" != "latest" ]; then
    echo "  - ${IMAGE_NAME}:latest"
fi
