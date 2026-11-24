# Contributing to AerosPanel

Thanks for contributing to AerosPanel. Please read the core rules below before opening a pull request.

## Core Architecture Rules

- **Zero Docker**: All managed apps run natively as `systemd` units. Do not introduce Docker, containerd, or PM2 dependencies.
- **Low Idle Footprint (~20-30 MB RAM)**: No background polling daemons, cron loops, or heavy runtime dependencies. Telemetry, service status, and remote access checks run on demand only.
- **Single-Process Production**: Express serves both the API, WebSocket log stream, and prebuilt `frontend/dist` static files.
- **Security Guards**: Never bypass or weaken:
  - `assertManageableServiceName` (protects system and panel units)
  - `validateWorkDir` (blocks system directories and path traversal)
  - `validateRepositoryUrl` and `validateGitBranch` (blocks unsafe git protocols and flag injection)
  - `requireAuth` (`scrypt` + `HttpOnly` cookie), `requireSameOriginForMutations`, and WebSocket `Origin` checks
  - Never log `.env` values, tokens, webhook secrets, or passwords.

## Local Development

### Prerequisites

- Node.js 20+ (22 LTS recommended)
- npm
- Linux host with `systemd` for testing `systemctl` / `journalctl` / `/sys/class/` features (Windows/macOS works for frontend and backend unit tests)

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` and `/ws` requests to the backend dev server.

## Verification Before Opening a PR

Run all checks and confirm exit code `0`:

```bash
cd backend && npm run build && npm test
cd frontend && npm run lint && npm run build
```

Backend tests use Node's built-in test runner (`node --import tsx --test`). Keep new tests fast and dependency-free.

## Pull Request Guidelines

- Keep changes focused and small.
- Describe what changed and how you verified it.
- Do not commit `*.db` files, `.env` files, or build artifacts (`dist/`).
