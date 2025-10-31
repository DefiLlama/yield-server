const slsw = require('serverless-webpack');
const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: slsw.lib.entries,
  target: 'node',
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
  module: {
    rules: [
      {
        test: /\.(ts|js)$/,
        use: { loader: 'babel-loader' },
        include: path.resolve(__dirname, 'src'),
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    mainFields: ['main'],
    extensions: ['.js', '.ts', '.json'],
    alias: {
      'bignumber.js$': 'bignumber.js/bignumber.js',
      'node-fetch$': 'node-fetch/lib/index.js',
    },
  },
  plugins: [
    // pg optionally requires pg-native; ignore it -> webpack doesn't fail when the native addon isn't installed
    new webpack.IgnorePlugin({ resourceRegExp: /^pg-native$/ }),
  ],
};
