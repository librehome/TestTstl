const path = require('path');
var webpack = require('webpack');

module.exports = {
    entry: './src/main.ts',
    devtool: 'inline-source-map',
    devServer: {
      contentBase: './dist'
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/
        }
      ]
    },
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, 'dist')
    },
    plugins: [
        new webpack.ProvidePlugin({
               process: 'process/browser',
        }),
        new webpack.ContextReplacementPlugin(/typescript-to-lua/),
        new webpack.ContextReplacementPlugin(/typescript/),
    ],
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ],
        alias: {
          process: "process/browser"
        },
        extensions: ['.ts', '.js', '.json'],
        fallback: {
          fs: false
        }
      }
  };
