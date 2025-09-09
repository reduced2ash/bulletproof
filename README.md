# Bulletproof — Cross‑Platform Desktop VPN Client

<img alt="Bulletproof" src="frontend/src/assets/icon.png" width="180" />

[![Electron](https://img.shields.io/badge/Electron-30-blue?logo=electron)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-18%2B-green?logo=node.js)](https://nodejs.org/)
[![Go](https://img.shields.io/badge/Go-1.22-blue?logo=go)](https://go.dev/)
[![Platforms](https://img.shields.io/badge/Platforms-macOS%20%7C%20Windows%20%7C%20Linux-888)](#)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](#license)

Bulletproof is a fast, privacy‑first desktop VPN for macOS, Windows, and Linux. Click once to secure your connection, pick an exit country, and get on with your day — no accounts required, no clutter, and no guesswork.

Why Bulletproof
- Simple: one big button, smart defaults, clear status.
- Flexible: switch between WARP/WARP+, Gool, and Psiphon depending on your needs.
- Full control: app‑only proxy, system proxy (PAC), or full‑device TUN mode.
- Built‑in tools: ping, speed test, diagnostics — all in one place.
- Privacy by design: everything runs locally; identities stay on your device.


## Quick Preview

<div align="center">
  <img alt="Main UI" src="docs/screenshot-main.png" width="260" />
  <img alt="Settings" src="docs/screenshot-settings.png" width="260" />
  <img alt="Tools" src="docs/screenshot-tools.png" width="260" />
  <br />
  <sub>Run <code>npm run shot</code> in <code>frontend/</code> to regenerate.</sub>
  <br />
  <br />
  
</div>

## Downloads

- macOS: DMG and ZIP — get the latest from [Releases › Latest](../../releases/latest). If unsigned, Control‑click → Open on first run (see Troubleshooting).
- Windows: Installer (Squirrel) — download from [Releases › Latest](../../releases/latest) and run Setup.exe.
- Linux: ZIP — download from [Releases › Latest](../../releases/latest), unzip, run the binary.
- All versions: [Releases](../../releases)


## Highlights

- Multiple networks: WARP/WARP+, Gool, Psiphon
- Three ways to route: Direct (in‑app proxy), PAC (system‑wide), or TUN (full‑device)
- Instant feedback: connection state, bind, exit country, PAC/TUN indicators
- Useful tools: ping, proxy test, speed test, and diagnostics
- Cross‑platform: macOS, Windows, Linux
- Polished desktop experience: tray, start on boot, sensible defaults

## Get Started

- Download the latest release for your OS (see Downloads above), or build locally.

- Or build locally:
  - Backend: `cd backend && go build -o bulletproofd ./cmd/bulletproofd`
  - Frontend: `cd frontend && npm ci && npm start`
- Pick a method (WARP/Gool/Psiphon), choose integration, and click Connect.
- Optional: set an exit country or WARP+ license in Settings.

## Privacy & Security

- No accounts required; WARP identities are stored locally on your machine.
- The backend binds to `127.0.0.1` and never exposes a public port.
- You’re in control: enable/disable system proxy (PAC) or TUN at any time.


## Under the Hood (for Developers)

- Frontend: Electron + React/TypeScript
  - Main process spawns the backend and exposes IPC for: connect, disconnect, status, diagnostics, ping, proxy test, etc.
  - Renderer provides the UI (toggle, status, Settings, Tools).
- Backend: Go HTTP daemon (`bulletproofd`)
  - Orchestrates provider engines using bundled helpers: `warp-plus` for WARP/Gool/Psiphon, optional Sing‑Box for TUN.
  - Exposes a localhost HTTP API for the UI and for CLI users.
- Helpers: distributed under `frontend/resources/bin/<platform>-<arch>/`
  - `warp-plus(.exe)` — establishes the encrypted tunnel and exposes local SOCKS5 (canonically `127.0.0.1:8086`).
  - `sing-box(.exe)` or `sb-helper(.exe)` — sets up a TUN device that forwards into the local SOCKS proxy.

How it works at a glance:

1) Ensure WARP identity (create/register on first connect; reuse afterward).
2) Start the provider engine (`warp-plus`) which exposes a local SOCKS5.
3) Apply the chosen integration:
   - Direct: do nothing — apps can use the local SOCKS5.
   - PAC: set system‑wide Proxy Auto‑Config so apps use the SOCKS5.
   - TUN: run Sing‑Box to create a TUN that routes traffic into SOCKS5.
4) Report status and keep lightweight supervision of helper processes.


## Repository Layout

- `backend/` — Go 1.22 service `bulletproofd`
  - Entry: `backend/cmd/bulletproofd/main.go`
  - HTTP API: `backend/internal/api/server.go`
  - Core manager/state: `backend/internal/core/*`
  - Default state dir: `./state` (relative to backend)
- `frontend/` — Electron + React + TypeScript
  - Main: `frontend/src/main.ts`
  - Renderer: `frontend/src/renderer.tsx`, `frontend/src/App.tsx`
  - Preload: `frontend/src/preload.ts`
  - Helper binaries: `frontend/resources/bin/<platform>-<arch>/`
  - Dev state: `frontend/state/`
- Root: `.env` (optional), `README_BACKEND.md` (backend specifics)


## Quick Start (Development)

Prereqs: Go 1.22+, Node 18+ (Electron 30), a recent npm.

1) Build backend

```bash
cd backend
go mod tidy
go build -o bulletproofd ./cmd/bulletproofd
```

2) Install frontend deps and start Electron (spawns backend automatically)

```bash
cd ../frontend
npm ci
npm start
```

Notes:

- The Electron main process will try to spawn `../backend/bulletproofd`. Override with `BACKEND_BIN=/custom/path/bulletproofd npm start`.
- On macOS, bundled helpers may be quarantined. The app attempts to remove `com.apple.quarantine` and `chmod +x` automatically.


## Building & Packaging

- Backend only:

```bash
cd backend && go build -o bulletproofd ./cmd/bulletproofd
./backend/bulletproofd -addr 127.0.0.1:4765 -state ./state
```

- Frontend dev:

```bash
cd frontend && npm ci
npm start
```

- Package desktop app (Electron Forge):

```bash
cd frontend && npm run make
```

Binaries for helpers must be present under `frontend/resources/bin/<platform>-<arch>/` so they are included in the packaged app.

<!-- Icon generation section removed: CI builds use provided assets, no generator required. -->


## Configuration

- Backend address: fixed to `127.0.0.1:4765`.
- State directories:
  - Backend: `backend/state` (identity, logs, generated config)
  - Frontend (dev UI state): `frontend/state`
- Environment variables:
  - `BACKEND_BIN` — explicit path to `bulletproofd` that Electron should spawn during development.
  - `WARPPLUS_BIN` — path to `warp-plus(.exe)`; auto‑detected from `resources/bin` when packaged.
  - `SINGBOX_BIN` — path to `sing-box(.exe)` or `sb-helper(.exe)`; auto‑detected from `resources/bin` when packaged.
  - `WARPPLUS_IPV4` / `WARPPLUS_IPV6` — set to `1` to prefer only that IP family.
  - `WARPPLUS_VERBOSE` — set to `1` for more verbose engine logs.
  - `WARPPLUS_TEST_URL` / `WARPPLUS_TEST_URLS` — connectivity probe URL(s) used by the engine.
  - Speed test: the renderer’s speed test requires a token for `fast-speedtest-api`. Provide via your own config; do not commit secrets.

Helper binaries layout (packaging):

```
frontend/resources/bin/
  darwin-x64/      warp-plus   sing-box
  darwin-arm64/    warp-plus   sing-box
  linux-x64/       warp-plus   sing-box
  win32-x64/       warp-plus.exe   sing-box.exe
```


## Using the App

- Toggle: click the big switch to connect/disconnect.
- Status: see connection state, active bind, and short messages (e.g., “warp warming”, “warp active”).
- Settings: choose provider (`warp`, `gool`, `psiphon`), integration (`direct`, `pac`, `tun`), server/port (if applicable), exit country, and license type (WARP+ optional key).
- Tools: ping a host, quick proxy connectivity test, and speed test.
- Tray: minimize to tray; tray menu includes “Show App”, “Start on Boot”, and “Quit”.


## Screenshots

Generated demos (run `npm run shot` inside `frontend/`). The PNGs live in `docs/` and are thumbnailed above in Quick Preview.

<!-- Contact section removed as requested -->


## HTTP API (Backend)

Base URL: `http://127.0.0.1:4765`

- `GET /v1/health` → `ok`
- `GET /v1/status` → current status JSON
- `POST /v1/connect` body:

```json
{
  "provider": "warp|gool|psiphon",
  "exitCountry": "US",
  "server": "optional endpoint",
  "port": 0,
  "options": {
    "integration": "direct|pac|tun",
    "key": "<optional WARP+ license>",
    "bind": "127.0.0.1:8087" // public SOCKS bind (backend may override/persist)
  }
}
```

- `POST /v1/disconnect`
- `GET /v1/identity` — show identity presence and metadata
- `POST /v1/identity/reset` — reset identity (next connect will re‑register)
- `GET /v1/scan` — list candidate endpoints (via engine `--scan`)
- `GET /v1/proxy/enable` / `GET /v1/proxy/disable` — enable/disable system PAC (macOS implemented)
- `GET /proxy.pac` — generated PAC file pointing at local SOCKS
- `GET /v1/test/socks?bind=127.0.0.1:8086` — simple HTTP fetch via local SOCKS for diagnostics
- `GET /v1/diag` — snapshot with status, env, paths, and quick TCP probes

Notes:

- The engine’s canonical internal SOCKS bind is `127.0.0.1:8086`. A shim may provide a separate public bind to avoid collisions and provide direct fallback while the tunnel warms.


## Development Notes

- Go style: `go fmt`; lowercase packages; exported APIs in PascalCase; keep state in `core.Manager`; return errors and log at edges.
- TypeScript/React style: 2‑space indent; strict TS; components in PascalCase; keep components small.
- Linting: `npx eslint 'src/**/*.{ts,tsx}'` (configure as needed).
- Tests:
  - Go: place `*_test.go` next to sources; run `cd backend && go test ./...`.
  - Frontend: no runner configured (recommend Vitest/Jest + Testing Library if added later).


## Security & Privacy

- Do not commit secrets (e.g., speed‑test tokens, license keys).
- Backend binds to `127.0.0.1` only — do not expose it publicly.
- Identity and logs live under `backend/state`. Clear this directory to reset backend state. The frontend’s local UI state lives under `frontend/state`.


## Troubleshooting

- Backend not found when running `npm start`:
  - Build it first (`go build`) or set `BACKEND_BIN=/path/to/bulletproofd npm start`.
- Helpers not executable (macOS/Linux):
  - The app tries to `chmod +x` and remove quarantine; if needed run `chmod +x` and `xattr -d com.apple.quarantine` manually.
- No connection / port not listening:
  - Check `backend/state/warp-plus.log` and `GET /v1/diag`.
  - Ensure `warp-plus` exists under `frontend/resources/bin/<platform>-<arch>/`.
  - Try forcing IPv4 with `WARPPLUS_IPV4=1`.
- Speed test fails:
  - Provide a valid token via your local config and restart; the shipped code uses `fast-speedtest-api` and requires a token.
- PAC/TUN issues:
  - PAC is implemented for macOS. TUN requires appropriate privileges and a working Sing‑Box binary.
 - macOS says the app is “damaged” or deletes it on first run:
   - This happens with unsigned downloads due to Gatekeeper quarantine. Control‑click the app → Open, or remove the quarantine attribute:
     - `xattr -dr com.apple.quarantine /Applications/Bulletproof.app` (adjust path if needed), then launch again.
   - We support optional signing & notarization in CI; if you provide Apple Developer credentials as GitHub Secrets (see release.yml), macOS builds will be signed and notarized.


## Contributing

- Use Conventional Commits (e.g., `feat: add psiphon provider`, `fix: handle connect error`).
- Open PRs with a clear description, repro/verify steps, screenshots for UI changes, and call out any backend API changes. Ensure the backend builds and `npm start` works.


## License

MIT — see `LICENSE` for details.


---

For backend‑only details, see `README_BACKEND.md`.

## Acknowledgements

We’re grateful to the open‑source projects and communities that make Bulletproof possible:

- `warp-plus` tunnel helper — upstream authors and maintainers of the Warp+ engine used to establish encrypted tunnels.
- `sing-box` — high‑quality networking toolkit used for TUN mode (SagerNet).
- Electron, Electron Forge — cross‑platform desktop app framework and tooling.
- React, TypeScript, Webpack — the frontend stack powering the UI.
- fast-speedtest-api, ping — utilities that enable in‑app network tools.
- The broader Go and Node.js ecosystems — robust standard libraries and modules.

Trademarks are the property of their respective owners. Bulletproof is not affiliated with Cloudflare, Psiphon, or any other third parties named here.

## Contributors

Huge thanks to everyone who has contributed ideas, bug reports, and code. Your feedback and PRs help shape Bulletproof. If you’ve contributed and don’t see your name listed yet, please open an issue or PR to be added.
