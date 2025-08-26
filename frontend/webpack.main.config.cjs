const path = require('path');

module.exports = {
  mode: 'development',
  target: 'electron-main',
  entry: path.resolve(__dirname, 'src/main.ts'),
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js']
  },
  output: {
    path: path.resolve(__dirname, '.webpack/main'),
    filename: 'index.js'
  }
};
