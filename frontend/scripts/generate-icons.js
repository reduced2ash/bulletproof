/*
  Generate platform icons from the base PNG logo.
  - Input:  frontend/src/assets/icon.png (square, >=1024x1024 recommended)
  - Output: frontend/src/assets/icon.icns (macOS), icon.ico (Windows)

  Usage:
    cd frontend
    npm run build:icons
*/

const path = require('path');
const fs = require('fs');
const iconGen = require('icon-gen');

async function main() {
  const input = path.resolve(__dirname, '..', 'src', 'assets', 'icon.png');
  const outDir = path.resolve(__dirname, '..', 'src', 'assets');
  if (!fs.existsSync(input)) {
    console.error('[icons] Base PNG not found at', input);
    process.exit(1);
  }
  try {
    console.log('[icons] Generating macOS .icns and Windows .ico from', input);
    await iconGen(input, outDir, {
      report: true,
      icns: { name: 'icon' },
      ico: { name: 'icon', sizes: [16, 24, 32, 48, 64, 128, 256] },
    });
    console.log('[icons] Done. Files at', outDir);
  } catch (e) {
    console.error('[icons] Failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

main();

