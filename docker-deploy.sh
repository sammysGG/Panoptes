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

# ---- detect package manager -------------------------------------------------
if command -v apt-get >/dev/null 2>&1; then PM=apt
elif command -v dnf >/dev/null 2>&1; then PM=dnf
elif command -v yum >/dev/null 2>&1; then PM=yum
else PM=none; fi

is_kali() { grep -qi 'kali' /etc/os-release 2>/dev/null; }

# Kali rotated its repo signing key (NO_PUBKEY ED65462EC8D5E4C5); without the
# refreshed keyring apt can't verify the index and package installs fail.
fix_kali_keyring() {
  is_kali || return 0
  info "Refreshing Kali archive keyring (fixes NO_PUBKEY signature errors)"
  if curl -fsSL https://archive.kali.org/archive-keyring.gpg -o /tmp/kali-keyring.gpg; then
    run install -m 0644 /tmp/kali-keyring.gpg /usr/share/keyrings/kali-archive-keyring.gpg \
      || warn "could not install refreshed Kali keyring — continuing"
  else
    warn "could not download the Kali keyring — continuing with the existing one"
  fi
}

# The Docker convenience script (get.docker.com) does NOT work on Kali: it maps
# Kali's codename to a download.docker.com repo that doesn't exist. Install the
# engine from the distro's own repo instead (docker.io on Debian/Kali/Ubuntu).
install_docker_engine() {
  bold "==> Installing Docker Engine"
  case "$PM" in
    apt)
      # A half-run convenience script may have left a broken docker.list that
      # makes every apt update fail — remove it before we try again.
      if [ -f /etc/apt/sources.list.d/docker.list ] && \
         grep -q 'download.docker.com' /etc/apt/sources.list.d/docker.list 2>/dev/null; then
        warn "Removing broken /etc/apt/sources.list.d/docker.list left by get.docker.com"
        run rm -f /etc/apt/sources.list.d/docker.list
      fi
      fix_kali_keyring
      run apt-get update -y || warn "apt-get update reported issues — continuing with cached lists"
      run env DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io \
        || die "failed to install docker.io from the distro repository"
      ;;
    dnf) run dnf install -y docker || die "failed to install docker via dnf" ;;
    yum) run yum install -y docker || die "failed to install docker via yum" ;;
    *)   die "no supported package manager (apt/dnf/yum) to install Docker — install Docker manually and re-run" ;;
  esac
  run systemctl enable --now docker 2>/dev/null || run service docker start 2>/dev/null || true
}

# Compose v2 plugin as a standalone binary from GitHub — avoids apt entirely
# (Debian/Kali only ship the deprecated v1 docker-compose, if anything).
install_compose_plugin() {
  info "Installing Docker Compose v2 plugin"
  local arch dest
  case "$(uname -m)" in
    x86_64|amd64) arch=x86_64 ;;
    aarch64|arm64) arch=aarch64 ;;
    armv7l) arch=armv7 ;;
    *) arch="$(uname -m)" ;;
  esac
  dest=/usr/local/lib/docker/cli-plugins
  run mkdir -p "$dest"
  run curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${arch}" \
    -o "$dest/docker-compose" || die "failed to download the Docker Compose plugin"
  run chmod +x "$dest/docker-compose"
}

# ---- ensure Docker + Compose ------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  info "Docker already installed ($(docker --version))"
else
  install_docker_engine
fi

# Resolve a working Compose command; install the v2 plugin if neither is present.
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  install_compose_plugin
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  else
    die "Docker Compose is still unavailable after install — install it manually and re-run."
  fi
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
