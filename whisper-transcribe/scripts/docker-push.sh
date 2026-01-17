#!/bin/bash
set -e

IMAGE_NAME="arkayos/whisper-transcribe"
TAG="${1:-latest}"

echo "Building Docker image: ${IMAGE_NAME}:${TAG}"
docker build -t "${IMAGE_NAME}:${TAG}" .

echo "Pushing Docker image: ${IMAGE_NAME}:${TAG}"
docker push "${IMAGE_NAME}:${TAG}"

# Also push latest if a specific version was provided
if [ "$TAG" != "latest" ]; then
    docker tag "${IMAGE_NAME}:${TAG}" "${IMAGE_NAME}:latest"
    echo "Pushing: ${IMAGE_NAME}:latest"
    docker push "${IMAGE_NAME}:latest"
fi

echo "Push complete!"
