# Bulletproof Backend (Go) — MVP

A small HTTP daemon (`bulletproofd`) that the Electron app can talk to.

## Build

```bash
cd backend
go mod tidy
go build -o bulletproofd ./cmd/bulletproofd
./bulletproofd -addr 127.0.0.1:4765 -state ./state
```

## API

- `GET  /v1/health` → `ok`
- `GET  /v1/status` → current status
- `POST /v1/connect` body: `{ "provider": "warp", "exitCountry": "US", "options": { "integration": "direct|pac|tun", "key": "<WARP or WARP+ key>" } }`
- `POST /v1/disconnect`

Providers: `warp`, `gool`, `psiphon`. On connect:

- Ensures a WARP identity exists (registers via Cloudflare /reg if missing)
- Starts `warp-plus` (bundled) to establish the WARP/WARP+/CFON tunnel and expose local SOCKS5 at `127.0.0.1:8086`
- Applies integration:
  - `direct`: no system changes; app tools can use the SOCKS proxy directly
  - `pac`: enables system-wide PAC pointing to the local SOCKS (macOS implemented)
  - `tun`: starts the Sing-Box helper to create a TUN device that forwards to the local SOCKS

Notes:

- No WARP+ license is required for basic use. Omit `options.key` to use free WARP.
- You can apply a WARP+ license later by reconnecting with `options.key` set; the engine will upgrade the existing registered device.

## Electron integration (dev strategy)

From Electron **main** process, spawn the daemon on app start:

```ts
import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import path from 'path';

let backendProc: ReturnType<typeof spawn> | null = null;

function startBackend() {
  const bin = process.env.BACKEND_BIN || path.join(process.cwd(), 'backend', 'bulletproofd');
  backendProc = spawn(bin, ['-addr', '127.0.0.1:4765'], { stdio: 'inherit' });
}

app.whenReady().then(async () => {
  startBackend();
  // Optionally poll http://127.0.0.1:4765/v1/health before showing UI
});
```

In production, place the binaries under Electron Forge extraResources so they are packaged:

- `frontend/resources/bin/<platform>-<arch>/warp-plus(.exe)`
- `frontend/resources/bin/<platform>-<arch>/sb-helper(.exe)` or `sing-box(.exe)`

The Electron main process resolves those and exports them to the backend process via env vars:

- `WARPPLUS_BIN`: absolute path to `warp-plus`
- `SINGBOX_BIN`: absolute path to `sb-helper`/`sing-box`
