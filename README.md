# AerosPanel

A highly optimized, ultra-lightweight server management panel designed specifically for low-resource Linux environments (such as Intel Celeron laptops or 4GB RAM devices). 

Unlike heavy alternatives like Coolify or Pterodactyl that rely on Docker and complex proxies, AerosPanel interfaces directly with native Linux tools to keep the hardware footprint at absolute zero when idle.

## Features

- **Zero Docker Requirement**: Manages your bots and web apps directly via native `systemd` services.
- **Hardware Telemetry**: Reads native Linux paths (`/sys/class/...`) to monitor CPU, RAM, Disk Space, temperatures, and laptop battery status in real-time.
- **Live Terminal**: Streams `journalctl` directly to your browser over WebSockets for instant debugging.
- **Terminal UI**: A strict, lightweight, cyberpunk-inspired visual interface built with Tailwind CSS.
- **Tailscale Ready**: Designed to work in a headless decoupled architecture (Frontend on Vercel, Backend local) secured by Tailscale Funnel without exposing ports.

## Architecture

- **Backend**: Node.js + Express + TypeScript + SQLite (Easily swap to MySQL via Knex).
- **Frontend**: React + Vite + Tailwind CSS v4.

## Setup & Development

### 1. Backend (Linux Agent)
```bash
cd backend
npm install
npm run dev
```

### 2. Frontend (Dashboard)
```bash
cd frontend
npm install
npm run dev
```

## License
Open-source project built for optimal resource utilization.
