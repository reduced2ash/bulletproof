# Repository Guidelines

## App Overview & Scope
Bulletproof is a cross‑platform desktop VPN client with an Electron (TypeScript/React) UI and a Go backend (custom WireGuard engine). It offers secure, encrypted connectivity via three methods: WARP/WARP+, Gool, and Psiphon. Users can choose integration mode: direct proxy (no system changes), system‑wide proxy via PAC, or a TUN interface via Sing‑Box. The UI is a fixed‑size, vertically oriented window with a large on/off toggle (grey when off, bright when on), status text, and a gear icon opening Settings (method radio buttons with descriptions, server/port, exit country, licence type). Utilities include network scan, ping, speed test, and a Windows in‑app updater. Tray support enables minimize to tray, auto‑start, and a context menu.

## Project Structure
- `backend/`: Go 1.22 service `bulletproofd` — entry `cmd/bulletproofd/main.go`; HTTP API in `internal/api/server.go`; core in `internal/core/*`; default state dir `./state`.
- `frontend/`: Electron + React + TS — main process `src/main.ts`; renderer `src/renderer.tsx`, `src/App.tsx`; preload `src/preload.ts`; assets and HTML under `src/`.
- Root: `.env`, `README_BACKEND.md`.

## Build, Test, and Development
- Backend build: `cd backend && go build -o bulletproofd ./cmd/bulletproofd`
- Backend run: `./backend/bulletproofd -addr 127.0.0.1:4765 -state ./state`
- Frontend install: `cd frontend && npm ci`
- Frontend dev: `npm start` (Electron; main may spawn `../backend/bulletproofd`)
- Package app: `npm run make` (Electron Forge)
- Lint (FE): `npx eslint 'src/**/*.{ts,tsx}'`

## Coding Style & Naming
- Go: `go fmt`; lower‑case packages; exported APIs in PascalCase; return errors, log at edges; keep state in `core.Manager`.
- TypeScript/React: 2‑space indent, strict TS; components PascalCase `*.tsx`; variables/functions camelCase; keep components small.

## Testing Guidelines
- Go: `*_test.go` next to sources; run `cd backend && go test ./...`.
- Frontend: no runner configured; if added, prefer Vitest/Jest + Testing Library; name `*.test.ts(x)`.

## Commit & Pull Requests
- Commits: Conventional Commits (e.g., `feat: add psiphon provider`, `fix: handle connect error`).
- PRs: clear description, linked issues, repro/verify steps, screenshots for UI; note backend API changes; ensure backend builds and `npm start` runs.

## Security & Configuration
- Never commit secrets; provide the speed‑test token via env/config.
- Override backend path with `BACKEND_BIN=/custom/bulletproofd npm start`.
- Backend binds `127.0.0.1:4765`; avoid exposing externally. Clear `frontend/state` to reset local state.
