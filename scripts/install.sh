#!/usr/bin/env bash
set -euo pipefail

# AerosPanel single-command production installer for Debian / Ubuntu
# Zero Docker. Native Node.js + systemd single-process deployment.

AEROS_DIR="${AEROS_DIR:-/opt/aeros-panel}"
AEROS_PORT="${AEROS_PORT:-3000}"
AEROS_REPO="${AEROS_REPO:-https://github.com/DevModee/Aeros-Panel.git}"
AEROS_BRANCH="${AEROS_BRANCH:-main}"
AEROS_ADMIN_USER="${AEROS_ADMIN_USER:-admin}"
AEROS_MEMORY_MAX="${AEROS_MEMORY_MAX:-256M}"
AEROS_CLEAN_FRONTEND_MODULES="${AEROS_CLEAN_FRONTEND_MODULES:-1}"

BLUE='\033[0;36m'
PURPLE='\033[0;35m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${BLUE}[AEROS]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

if [[ "${EUID}" -ne 0 ]]; then
    err "Please run as root (e.g. curl -fsSL ... | sudo bash)."
fi

if ! command -v systemctl >/dev/null 2>&1; then
    err "systemd is required on this host."
fi

if ! command -v apt-get >/dev/null 2>&1; then
    err "This installer targets Debian/Ubuntu systems with apt-get."
fi

if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    log "Detected OS: ${PRETTY_NAME:-Linux}"
fi

log "Installing base prerequisites..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg build-essential python3 >/dev/null

NEED_NODE=1
if command -v node >/dev/null 2>&1; then
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
    if [[ "${NODE_MAJOR}" -ge 20 ]]; then
        NEED_NODE=0
        ok "Node.js $(node -v) already installed."
    else
        warn "Found Node.js $(node -v); upgrading to Node.js 22 LTS..."
    fi
fi

if [[ "${NEED_NODE}" -eq 1 ]]; then
    log "Installing Node.js 22 LTS via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
    ok "Installed Node.js $(node -v)."
fi

NODE_BIN="$(command -v node)"

if [[ -d "${AEROS_DIR}/.git" ]]; then
    log "Existing installation found at ${AEROS_DIR}; updating branch ${AEROS_BRANCH}..."
    git -C "${AEROS_DIR}" fetch --prune origin "${AEROS_BRANCH}"
    git -C "${AEROS_DIR}" checkout "${AEROS_BRANCH}"
    git -C "${AEROS_DIR}" pull --ff-only origin "${AEROS_BRANCH}"
else
    log "Cloning AerosPanel into ${AEROS_DIR}..."
    mkdir -p "$(dirname "${AEROS_DIR}")"
    git clone --depth 1 --branch "${AEROS_BRANCH}" "${AEROS_REPO}" "${AEROS_DIR}"
fi

log "Building frontend static bundle..."
cd "${AEROS_DIR}/frontend"
npm ci --no-audit --no-fund
npm run build

if [[ "${AEROS_CLEAN_FRONTEND_MODULES}" -eq 1 ]]; then
    rm -rf "${AEROS_DIR}/frontend/node_modules"
fi
ok "Frontend compiled to ${AEROS_DIR}/frontend/dist."

log "Building backend (single-process production server)..."
cd "${AEROS_DIR}/backend"
npm ci --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
ok "Backend compiled to ${AEROS_DIR}/backend/dist."

ENV_FILE="${AEROS_DIR}/backend/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
    cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=${AEROS_PORT}
HOST=0.0.0.0
EOF
    chmod 600 "${ENV_FILE}"
fi

DB_FILE="${AEROS_DIR}/backend/aeros.db"
INITIAL_PASSWORD=""
if [[ ! -f "${DB_FILE}" ]]; then
    INITIAL_PASSWORD="$("${NODE_BIN}" -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")"
    log "Initializing SQLite database and seeding admin account..."
    "${NODE_BIN}" "${AEROS_DIR}/backend/dist/seed.js" "${AEROS_ADMIN_USER}" "${INITIAL_PASSWORD}"
    chmod 600 "${DB_FILE}"
    ok "Admin account seeded with scrypt hash."
else
    ok "Existing database preserved at ${DB_FILE}."
fi

SERVICE_FILE="/etc/systemd/system/aeros-panel.service"
log "Writing systemd service unit ${SERVICE_FILE}..."
cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=AerosPanel - Zero-Overhead Native Control Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${AEROS_DIR}/backend
EnvironmentFile=-${ENV_FILE}
Environment=NODE_ENV=production
ExecStart=${NODE_BIN} ${AEROS_DIR}/backend/dist/index.js
Restart=always
RestartSec=5
MemoryMax=${AEROS_MEMORY_MAX}
StandardOutput=journal
StandardError=journal
SyslogIdentifier=aeros-panel

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable aeros-panel >/dev/null
systemctl restart aeros-panel

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
LAN_IP="${LAN_IP:-127.0.0.1}"

TAILSCALE_IP=""
if command -v tailscale >/dev/null 2>&1; then
    TAILSCALE_IP="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
fi

echo ""
echo -e "${BLUE}==============================================================${NC}"
echo -e "${BLUE}  AEROS PANEL INSTALLED & RUNNING (ZERO DOCKER)${NC}"
echo -e "${BLUE}==============================================================${NC}"
echo -e "  Local URL     : ${GREEN}http://${LAN_IP}:${AEROS_PORT}${NC}"
if [[ -n "${TAILSCALE_IP}" ]]; then
    echo -e "  Tailscale URL : ${GREEN}http://${TAILSCALE_IP}:${AEROS_PORT}${NC}"
fi
if [[ -n "${INITIAL_PASSWORD}" ]]; then
    echo -e "  Username      : ${PURPLE}${AEROS_ADMIN_USER}${NC}"
    echo -e "  Password      : ${PURPLE}${INITIAL_PASSWORD}${NC}"
    echo -e "  ${YELLOW}(Save this password now — it is stored hashed in SQLite)${NC}"
else
    echo -e "  Credentials   : Existing admin account preserved"
fi
echo ""
echo -e "  Status        : systemctl status aeros-panel"
echo -e "  Live Logs     : journalctl -u aeros-panel -f"
echo -e "  Reset Pass    : node ${AEROS_DIR}/backend/dist/seed.js admin <new-password>"
echo -e "${BLUE}==============================================================${NC}"
echo ""
