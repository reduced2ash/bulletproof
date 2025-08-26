Place platform-specific helper binaries here so they are bundled into releases.

Expected layout:

- darwin-x64/
  - warp-plus
  - sb-helper (or sing-box)
- darwin-arm64/
  - warp-plus
  - sb-helper (or sing-box)
- linux-x64/
  - warp-plus
  - sb-helper (or sing-box)
- win32-x64/
  - warp-plus.exe
  - sb-helper.exe (or sing-box.exe)

At runtime the app resolves binaries from `resources/bin/<platform>-<arch>/`. During development, it resolves from `frontend/resources/bin/<platform>-<arch>/`.

You can also override paths via environment variables when starting Electron:

- `WARPPLUS_BIN=/custom/path/warp-plus`
- `SINGBOX_BIN=/custom/path/sb-helper`

