const path = require('path');
const { WebpackPlugin } = require('@electron-forge/plugin-webpack');

module.exports = {
  packagerConfig: {
    extraResources: [
      {
        from: path.resolve(__dirname, 'resources', 'bin'),
        to: 'bin',
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
