const path = require('path');
const { WebpackPlugin } = require('@electron-forge/plugin-webpack');
const { MakerZIP } = require('@electron-forge/maker-zip');
const { MakerSquirrel } = require('@electron-forge/maker-squirrel');
const { MakerDMG } = require('@electron-forge/maker-dmg');

// Dynamic packager config so we can enable signing/notarization via env in CI
const packagerConfig = {
    // Base icon path (Electron Packager will append platform extension: .icns on macOS, .ico on Windows)
    icon: path.resolve(__dirname, 'src', 'assets', 'icon'),
    extraResources: [
      {
        from: path.resolve(__dirname, 'resources', 'bin'),
        to: 'bin',
      },
      {
        from: path.resolve(__dirname, 'src', 'assets'),
        to: 'assets',
      },
      {
        from: path.resolve(__dirname, 'resources', 'backend'),
        to: 'backend',
      },
    ],
    osxSign: process.env.MAC_SIGN ? {
      identity: process.env.APPLE_IDENTITY,
      'hardened-runtime': true,
      'gatekeeper-assess': false,
    } : undefined,
    osxNotarize: process.env.MAC_NOTARIZE ? {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    } : undefined,
  };

module.exports = {
  packagerConfig,
  rebuildConfig: {},
  makers: [
    // Windows installer (Squirrel)
    new MakerSquirrel({
      authors: 'Roman Fertig',
      description: 'Bulletproof is a fast, privacy‑first desktop VPN for macOS, Windows, and Linux.',
      noMsi: true,
    }),
    // Zip archives for macOS and Linux to keep packaging simple
    new MakerZIP({}, ['darwin', 'linux']),
    // DMG for macOS (optional nicer experience)
    new MakerDMG({}),
  ],
  plugins: [
    new WebpackPlugin({
      mainConfig: path.resolve(__dirname, 'webpack.main.config.cjs'),
      renderer: {
        config: path.resolve(__dirname, 'webpack.renderer.config.cjs'),
        entryPoints: [
          {
            html: path.resolve(__dirname, 'src/index.html'),
            js: path.resolve(__dirname, 'src/renderer.tsx'),
            name: 'main_window',
            preload: {
              js: path.resolve(__dirname, 'src/preload.ts')
            }
          }
        ]
      }
    })
  ]
};
