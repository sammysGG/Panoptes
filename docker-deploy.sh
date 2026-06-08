#!/usr/bin/env bash
#
# Panoptes Docker deployer — clone (or update) from GitHub and bring the stack
# up with Docker Compose. Run on the target Linux machine, as root or with sudo:
#
#   curl -fsSL https://raw.githubusercontent.com/sammysGG/Panoptes/main/docker-deploy.sh | sudo bash
#
# or clone and run locally:
#
#   git clone https://github.com/sammysGG/Panoptes.git && sudo bash Panoptes/docker-deploy.sh
#
# Configurable via environment variables:
#   PANOPTES_REPO    git URL to clone   (default: https://github.com/sammysGG/Panoptes.git)
#   PANOPTES_BRANCH  branch to deploy   (default: main)
#   PANOPTES_DIR     install location   (default: /opt/panoptes)
#   PANOPTES_ADMIN_USER / PANOPTES_ADMIN_PASS   first-run admin account
#   FRONTEND_PORT    UI port            (default: 3000)
#   PORT             backend API port   (default: 4000)
set -euo pipefail

REPO="${PANOPTES_REPO:-https://github.com/sammysGG/Panoptes.git}"
BRANCH="${PANOPTES_BRANCH:-main}"
DIR="${PANOPTES_DIR:-/opt/panoptes}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${PORT:-4000}"
ADMIN_USER="${PANOPTES_ADMIN_USER:-admin}"
ADMIN_PASS="${PANOPTES_ADMIN_PASS:-panoptes}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '\033[1;34m[panoptes]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[panoptes]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[panoptes] %s\033[0m\n' "$*" >&2; exit 1; }

if [ "$(id -u)" -eq 0 ]; then
  run() { "$@"; }
else
  command -v sudo >/dev/null 2>&1 || die "Run as root or install sudo."
  run() { sudo "$@"; }
fi

# ---- ensure Docker + Compose ------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  bold "==> Installing Docker Engine"
  # Official convenience script; works across Debian/Ubuntu/Kali/RHEL families.
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh || die "failed to fetch Docker install script"
  run sh /tmp/get-docker.sh || die "Docker installation failed"
  run systemctl enable --now docker 2>/dev/null || true
else
  info "Docker already installed ($(docker --version))"
fi

# Compose plugin (v2) check; fall back to legacy docker-compose if present.
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die "Docker Compose not found. Install the docker-compose-plugin and re-run."
fi

# ---- fetch the source -------------------------------------------------------
SELF_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo '')"
if [ -d "$DIR/.git" ]; then
  bold "==> Updating existing checkout in $DIR"
  run git -C "$DIR" fetch --depth 1 origin "$BRANCH"
  run git -C "$DIR" reset --hard "origin/$BRANCH"
elif [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/docker-compose.yml" ] && [ -z "${PANOPTES_FORCE_CLONE:-}" ]; then
  if [ "$SELF_DIR" != "$DIR" ]; then
    bold "==> Deploying local checkout from $SELF_DIR into $DIR"
    run mkdir -p "$DIR"
    run cp -a "$SELF_DIR/." "$DIR/"
  fi
else
  bold "==> Cloning Panoptes ($BRANCH) into $DIR"
  run mkdir -p "$DIR"
  run git clone --depth 1 --branch "$BRANCH" "$REPO" "$DIR"
fi

# ---- .env (generate secret on first install) --------------------------------
ENV_FILE="$DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  bold "==> Generating $ENV_FILE"
  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  run tee "$ENV_FILE" >/dev/null <<EOF
PORT=$BACKEND_PORT
PANOPTES_SECRET_KEY=$SECRET
PANOPTES_ADMIN_USER=$ADMIN_USER
PANOPTES_ADMIN_PASS=$ADMIN_PASS
PANOPTES_CORS_ORIGIN=*
FRONTEND_PORT=$FRONTEND_PORT
NEXT_PUBLIC_API_PORT=$BACKEND_PORT
EOF
  run chmod 600 "$ENV_FILE"
else
  info "Keeping existing $ENV_FILE"
fi

# ---- build + start ----------------------------------------------------------
bold "==> Building and starting the stack (this can take a few minutes)"
( cd "$DIR" && run "${COMPOSE[@]}" up -d --build )

# ---- summary ----------------------------------------------------------------
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$IP" ] && IP="<server-ip>"
echo
bold "==> Panoptes is deployed (Docker)"
echo "   UI:        http://$IP:$FRONTEND_PORT"
echo "   API:       http://$IP:$BACKEND_PORT/api/health"
echo "   Login:     $ADMIN_USER / $ADMIN_PASS   (change PANOPTES_ADMIN_PASS in $DIR/.env)"
echo
echo "   Logs:      (cd $DIR && ${COMPOSE[*]} logs -f)"
echo "   Restart:   (cd $DIR && ${COMPOSE[*]} restart)"
echo "   Stop:      (cd $DIR && ${COMPOSE[*]} down)"
echo "   Update:    re-run this script"
echo
warn "This tool stores SSH credentials for your range (encrypted at rest)."
warn "Only run it on a trusted host on your exercise network."
