const slsw = require('serverless-webpack');
const path = require('path');

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
};
