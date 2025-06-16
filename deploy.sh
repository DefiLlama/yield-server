#!/usr/bin/env bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Pull the latest changes
git fetch --all
git switch $1
git pull origin $1

echo "Clearing Docker build cache..."
docker builder prune -a -f
echo "Docker build cache cleared"

# Run the docker compose up command
docker compose up -d --build

# Check if the docker compose up command was successful
if [ $? -ne 0 ]; then
  echo "Failed to start the docker compose up command"
  exit 1
fi

echo "Deployed successfully"