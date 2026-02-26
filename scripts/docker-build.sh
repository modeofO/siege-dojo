#!/usr/bin/env bash
# Build siege-dojo contracts using Docker (sozo 1.8.6 + scarb 2.13.1)
# This ensures consistent CASM hashes matching Sepolia's compiler.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_TAG="siege-dojo-builder:1.8.6"

# Build Docker image if needed
if ! docker image inspect "$IMAGE_TAG" &>/dev/null; then
  echo "Building Docker image..."
  docker build -f "$PROJECT_DIR/Dockerfile.build" -t "$IMAGE_TAG" "$PROJECT_DIR"
fi

echo "Building contracts with sozo 1.8.6..."
docker run --rm -v "$PROJECT_DIR:/app" "$IMAGE_TAG" sozo build

echo ""
echo "Build complete. Artifacts in target/"
echo ""
echo "To migrate to Sepolia:"
echo "  docker run --rm -v \"$PROJECT_DIR:/app\" \\"
echo "    -e STARKNET_ACCOUNT=<path> \\"
echo "    -e STARKNET_KEYSTORE=<path> \\"
echo "    $IMAGE_TAG sozo migrate --profile sepolia --world 0x064292..."
