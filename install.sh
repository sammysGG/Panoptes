#!/usr/bin/env bash
#
# Panoptes installer — deploy the blue-team scanning & hardening console from GitHub.
#
# Quick start (on the target Linux machine, as root or with sudo):
#
#   curl -fsSL https://raw.githubusercontent.com/sammysGG/Panoptes/main/install.sh | sudo bash
#
# or clone and run locally:
#
#   git clone https://github.com/sammysGG/Panoptes.git && sudo bash Panoptes/install.sh
#
# Configurable via environment variables:
#   PANOPTES_REPO    git URL to clone           (default: https://github.com/sammysGG/Panoptes.git)
#   PANOPTES_BRANCH  branch to deploy           (default: main)
#   PANOPTES_DIR     install location           (default: /opt/panoptes)
#   PANOPTES_ADMIN_USER / PANOPTES_ADMIN_PASS   first-run admin account
#   FRONTEND_PORT    UI port                    (default: 3000)
#   PORT             backend API port           (default: 4000)
#   NO_SERVICE=1     build only, don't install/start systemd services
#
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

# Privilege wrappers. Defining run()/run_E() avoids the "empty $SUDO" bash gotcha
# where `$SUDO VAR=val cmd` would treat VAR=val as the command when run as root.
if [ "$(id -u)" -eq 0 ]; then
  run()   { "$@"; }
  run_E() { "$@"; }
else
  command -v sudo >/dev/null 2>&1 || die "Run as root or install sudo."
  run()   { sudo "$@"; }
  run_E() { sudo -E "$@"; }
fi

export DEBIAN_FRONTEND=noninteractive

# ---- detect package manager -------------------------------------------------
if command -v apt-get >/dev/null 2>&1; then PM=apt
elif command -v dnf >/dev/null 2>&1; then PM=dnf
elif command -v yum >/dev/null 2>&1; then PM=yum
else die "Unsupported distro: need apt, dnf, or yum."; fi

pkg_install() {
  case "$PM" in
    apt)
      # apt-get update can warn (e.g. a stale repo key) but still leave usable
      # cached indices — don't let that abort the install.
      run apt-get update -y || warn "apt-get update reported issues (stale index/keys) — continuing with cached lists"
      run env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
      ;;
    dnf) run dnf install -y "$@" ;;
    yum) run yum install -y "$@" ;;
  esac
}

bold "==> Installing prerequisites"
BASE_PKGS="git curl ca-certificates nmap"
# build tools so better-sqlite3 can compile if no prebuilt binary is available;
# xz is needed to unpack the Node.js tarball.
case "$PM" in
  apt) BASE_PKGS="$BASE_PKGS build-essential python3 xz-utils" ;;
  *)   BASE_PKGS="$BASE_PKGS gcc gcc-c++ make python3 xz" ;;
esac
# Non-fatal: on distros with a broken/stale package index (e.g. a Kali host with
# an expired archive key) these are usually already installed. We verify the
# essentials afterwards rather than aborting on an apt hiccup.
pkg_install $BASE_PKGS || warn "package install reported errors — continuing (likely already installed)"

command -v git  >/dev/null 2>&1 || die "git is required but not installed"
command -v curl >/dev/null 2>&1 || die "curl is required but not installed"
command -v nmap >/dev/null 2>&1 || warn "nmap not found — scans will use the built-in TCP-sweep fallback"

# ---- Node.js 20 (install from nodejs.org tarball if missing/old) ------------
# Deliberately avoids apt/NodeSource so a broken distro package index can't block
# the install. Drops a self-contained Node into /usr/local.
install_node_tarball() {
  local arch tarball url tmp
  case "$(uname -m)" in
    x86_64|amd64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    armv7l) arch=armv7l ;;
    *) die "unsupported CPU architecture for Node tarball: $(uname -m)" ;;
  esac
  info "Fetching latest Node.js 20.x ($arch) from nodejs.org"
  tarball="$(curl -fsSL https://nodejs.org/dist/latest-v20.x/ \
    | grep -oE "node-v20[0-9.]+-linux-${arch}\.tar\.xz" | head -1)"
  [ -n "$tarball" ] || die "could not determine the Node.js tarball name from nodejs.org"
  url="https://nodejs.org/dist/latest-v20.x/$tarball"
  tmp="$(mktemp -d)"
  curl -fsSL "$url" -o "$tmp/node.tar.xz" || die "failed to download $url"
  run tar -xJf "$tmp/node.tar.xz" -C /usr/local --strip-components=1
  rm -rf "$tmp"
  hash -r 2>/dev/null || true
}

need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge 18 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  install_node_tarball
  info "Installed Node.js $(node -v)"
else
  info "Node.js $(node -v) already present"
fi

command -v npm >/dev/null 2>&1 || die "npm not found after Node.js install"
# corepack ships with the tarball; enable it but don't fail if it's unavailable.
run corepack enable 2>/dev/null || true

# ---- fetch the source -------------------------------------------------------
bold "==> Fetching Panoptes ($BRANCH) into $DIR"
SELF_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo '')"
if [ -d "$DIR/.git" ]; then
  info "Existing checkout found — pulling latest"
  run git -C "$DIR" fetch --depth 1 origin "$BRANCH"
  run git -C "$DIR" reset --hard "origin/$BRANCH"
elif [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/backend/package.json" ] && [ -z "${PANOPTES_FORCE_CLONE:-}" ]; then
  # Running from inside an existing checkout: deploy it in place.
  if [ "$SELF_DIR" != "$DIR" ]; then
    info "Deploying local checkout from $SELF_DIR"
    run mkdir -p "$DIR"
    run cp -a "$SELF_DIR/." "$DIR/"
  fi
else
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

# ---- build backend ----------------------------------------------------------
bold "==> Building backend"
( cd "$DIR/backend" && run npm install --no-audit --no-fund && run npm run build )

# ---- build frontend ---------------------------------------------------------
bold "==> Building frontend (this can take a couple of minutes)"
( cd "$DIR/frontend" && run npm install --no-audit --no-fund && run npm run build )

# ---- nmap raw-socket capability (so SYN scans work without running as root) -
if command -v setcap >/dev/null 2>&1; then
  run setcap cap_net_raw,cap_net_admin+eip "$(command -v nmap)" 2>/dev/null || true
fi

if [ "${NO_SERVICE:-0}" = "1" ]; then
  bold "==> Build complete (NO_SERVICE=1, skipping services)"
  echo "Start manually:"
  echo "  (cd $DIR/backend  && node dist/index.js)"
  echo "  (cd $DIR/frontend && npx next start -p $FRONTEND_PORT)"
  exit 0
fi

# ---- systemd services -------------------------------------------------------
if ! command -v systemctl >/dev/null 2>&1; then
  warn "systemd not found — skipping service install. Start manually:"
  echo "  (cd $DIR/backend  && node dist/index.js)"
  echo "  (cd $DIR/frontend && npx next start -p $FRONTEND_PORT)"
  exit 0
fi

bold "==> Installing systemd services"
NODE_BIN="$(command -v node)"
NPX_BIN="$(command -v npx)"

run tee /etc/systemd/system/panoptes-backend.service >/dev/null <<EOF
[Unit]
Description=Panoptes backend (API + scan/hardening engine)
After=network.target

[Service]
Type=simple
WorkingDirectory=$DIR/backend
EnvironmentFile=$DIR/.env
ExecStart=$NODE_BIN dist/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

run tee /etc/systemd/system/panoptes-frontend.service >/dev/null <<EOF
[Unit]
Description=Panoptes frontend (Next.js UI)
After=network.target panoptes-backend.service

[Service]
Type=simple
WorkingDirectory=$DIR/frontend
EnvironmentFile=$DIR/.env
ExecStart=$NPX_BIN next start -p $FRONTEND_PORT
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

run systemctl daemon-reload
run systemctl enable --now panoptes-backend.service
run systemctl enable --now panoptes-frontend.service

# ---- summary ----------------------------------------------------------------
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$IP" ] && IP="<server-ip>"
echo
bold "==> Panoptes is deployed"
echo "   UI:        http://$IP:$FRONTEND_PORT"
echo "   API:       http://$IP:$BACKEND_PORT/api/health"
echo "   Login:     $ADMIN_USER / $ADMIN_PASS   (change PANOPTES_ADMIN_PASS in $DIR/.env)"
echo
echo "   Logs:      journalctl -u panoptes-backend -f"
echo "              journalctl -u panoptes-frontend -f"
echo "   Restart:   systemctl restart panoptes-backend panoptes-frontend"
echo
warn "This tool stores SSH credentials for your range (encrypted at rest)."
warn "Only run it on a trusted host on your exercise network."
