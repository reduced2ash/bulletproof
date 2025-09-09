const path = require('path');
const { WebpackPlugin } = require('@electron-forge/plugin-webpack');
const { MakerZIP } = require('@electron-forge/maker-zip');
const { MakerDeb } = require('@electron-forge/maker-deb');
const { MakerRpm } = require('@electron-forge/maker-rpm');
const { MakerSquirrel } = require('@electron-forge/maker-squirrel');

module.exports = {
  packagerConfig: {
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
  },
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
