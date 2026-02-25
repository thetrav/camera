#!/bin/bash
set -e

IMAGE_NAME="camera-app"
TAR_FILE="camera-deploy.tar"

echo "Building Docker image..."
docker build -t "$IMAGE_NAME" .

echo "Saving image to server..."
docker save $IMAGE_NAME | ssh travnas docker load

echo "Done! Copy your server/.env to your server, then run:"
echo "  docker run -d -p 8080:8080 --env-file .env $IMAGE_NAME"
