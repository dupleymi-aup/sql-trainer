#!/usr/bin/env bash
# ============================================
# Amvera Cloud Deployment Script
# ============================================
# Usage:
#   ./scripts/deploy-amvera.sh              # Build & push to Amvera registry
#   ./scripts/deploy-amvera.sh --git        # Deploy via git push (recommended)
#   ./scripts/deploy-amvera.sh --local      # Build locally only (for testing)
#   ./scripts/deploy-amvera.sh --cleanup    # Remove old images
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="sql-trainer"
REGISTRY="${AMVERA_REGISTRY:-registry.amvera.io}"
NAMESPACE="${AMVERA_NAMESPACE:-}"
AMVERA_REMOTE="${AMVERA_REMOTE:-amvera}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()  { echo -e "${RED}[deploy]${NC} $*" >&2; }

# ---- Parse args ----
MODE="push"
for arg in "$@"; do
  case "$arg" in
    --git)     MODE="git" ;;
    --local)   MODE="local" ;;
    --cleanup) MODE="cleanup" ;;
    --help|-h)
      echo "Usage: $0 [--git|--local|--cleanup]"
      echo "  (no args)  Build and push to Amvera registry"
      echo "  --git      Deploy via git push to Amvera remote (recommended)"
      echo "  --local    Build locally only (for testing)"
      echo "  --cleanup  Remove old images"
      exit 0
      ;;
    *) err "Unknown argument: $arg"; exit 1 ;;
  esac
done

cd "$PROJECT_DIR"

# ---- Git push mode (Amvera GitOps) ----
if [[ "$MODE" == "git" ]]; then
  log "Deploying via git push to Amvera..."

  # Check if amvera remote exists
  if ! git remote get-url "$AMVERA_REMOTE" &>/dev/null; then
    err "Amvera git remote '$AMVERA_REMOTE' is not configured."
    echo ""
    echo "Add it with:"
    echo "  git remote add amvera https://git.amvera.io/<namespace>/<project>.git"
    echo ""
    echo "Find your repo URL in Amvera Control Panel → Project → Settings → Git"
    exit 1
  fi

  # Ensure we're on main/master
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  log "Pushing branch '$BRANCH' to $AMVERA_REMOTE..."

  git push "$AMVERA_REMOTE" "$BRANCH"

  log ""
  log "Git push complete! Amvera will build and deploy automatically."
  log "Monitor the build at: Amvera Control Panel → Project → Builds"
  log ""
  log "Required environment variables (set in Amvera Control Panel → Settings):"
  log "  AUTH_SECRET    = <generate: openssl rand -base64 32>"
  log "  NEXTAUTH_URL   = https://<your-amvera-domain>"
  log "  DATABASE_PATH  = /app/data/users.db"
  exit 0
fi

# ---- Pre-flight checks for Docker modes ----
if ! command -v docker &>/dev/null; then
  err "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  err "Docker daemon is not running."
  exit 1
fi

# ---- Cleanup mode ----
if [[ "$MODE" == "cleanup" ]]; then
  log "Removing old images..."
  docker image prune -f --filter "label=app=sql-trainer" 2>/dev/null || true
  docker rmi "$IMAGE_NAME:latest" 2>/dev/null || true
  log "Cleanup complete."
  exit 0
fi

# ---- Build ----
log "Building Docker image..."
docker build \
  --target runner \
  --tag "$IMAGE_NAME:latest" \
  --label "app=sql-trainer" \
  --label "build=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  .

if [[ "$MODE" == "local" ]]; then
  log "Local build complete. Image: $IMAGE_NAME:latest"
  log "Test with: docker run --rm -p 3000:3000 -e AUTH_SECRET=test-secret-key-at-least-32-chars-long -e NEXTAUTH_URL=http://localhost:3000 $IMAGE_NAME:latest"
  exit 0
fi

# ---- Push to Amvera registry ----
if [[ -z "$NAMESPACE" ]]; then
  err "AMVERA_NAMESPACE is not set."
  echo "Set it to your Amvera project namespace:"
  echo "  export AMVERA_NAMESPACE=your-namespace"
  exit 1
fi

FULL_TAG="$REGISTRY/$NAMESPACE/$IMAGE_NAME:latest"
log "Tagging image as $FULL_TAG ..."
docker tag "$IMAGE_NAME:latest" "$FULL_TAG"

log "Pushing to $REGISTRY ..."
docker push "$FULL_TAG"

log "Push complete! Deploy from Amvera Control Panel."
log ""
log "Required environment variables in Amvera:"
log "  AUTH_SECRET    = <your-secret-32+ chars>"
log "  NEXTAUTH_URL   = https://<your-amvera-domain>"
log "  DATABASE_PATH  = /app/data/users.db"
