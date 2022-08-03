import CopyPlugin from 'copy-webpack-plugin';
import path, {dirname} from 'path';
import {fileURLToPath} from 'url';
import fs from 'fs';
import ExampleBuilder from './example-builder.mjs';
import webpack from 'webpack';

const baseDir = dirname(fileURLToPath(import.meta.url));

const src = path.join(baseDir, '..');
const buildDir = path.join(baseDir, "..", "..", "build", "site", "examples");

export default (env, argv) => {
    return {
        watchOptions: {
            ignored: /node_modules/,
            aggregateTimeout: 100,
            poll: true,
        },
        context: src,
        devtool: "source-map",
        entry: {
            giro3d: ['babel-polyfill', 'url-polyfill', 'whatwg-fetch', path.join(baseDir, 'giro3d.js')],
            index: [path.join(baseDir, '..', 'index.js')],
            debug: [path.join(baseDir, '..', '..', 'utils/debug/Main.js')],
        },
        target: ["web", "es5"],
        output: {
            filename: "[name].js",
            clean: true,
            path: buildDir,
            library: '[name]',
            libraryTarget: 'umd',
            umdNamedDefine: true,
            devtoolModuleFilenameTemplate: 'webpack://[namespace]/[resource-path]?[loaders]',
            devtoolNamespace: 'giro3d',
        },
        devServer: {
            hot: true,
            client: {
                progress: true,
                overlay: true,
            },
            static: [
                {
                    directory: path.join(baseDir, ".."),
                    publicPath: "/",
                },
            ],
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    use: "babel-loader",
                    exclude: /node_modules/,
                }
            ],
        },
        plugins: [
            new ExampleBuilder({
                templates: path.join(baseDir, '..', 'templates'),
                examplesDir: path.join(baseDir, '..'),
                buildDir: buildDir,
            }),
            new CopyPlugin({
                patterns: [
                    { from: "css", to: "css" },
                    { from: "js", to: "js" },
                    { from: "layers", to: "layers" },
                    { from: "screenshots", to: "screenshots" },
                    { from: "**/*.html"},
                ],
            }),
        ],
    }
};
