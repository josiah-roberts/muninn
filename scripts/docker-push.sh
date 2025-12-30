#!/bin/bash
set -e

IMAGE_NAME="arkayos/munnin"
TAG="${1:-latest}"

echo "Pushing Docker image: ${IMAGE_NAME}:${TAG}"
docker push "${IMAGE_NAME}:${TAG}"

# Also push latest if a specific version was provided
if [ "$TAG" != "latest" ]; then
    echo "Pushing: ${IMAGE_NAME}:latest"
    docker push "${IMAGE_NAME}:latest"
fi

echo "Push complete!"
