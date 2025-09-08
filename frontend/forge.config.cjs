const path = require('path');
const { WebpackPlugin } = require('@electron-forge/plugin-webpack');

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
    ],
  },
  rebuildConfig: {},
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
