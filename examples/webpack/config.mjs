/* eslint-disable import/no-extraneous-dependencies */
import CopyPlugin from 'copy-webpack-plugin';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import webpack from 'webpack';
import ExampleBuilder from './example-builder.mjs';

const baseDir = dirname(fileURLToPath(import.meta.url));

const src = path.join(baseDir, '..');
const buildDir = path.join(baseDir, '..', '..', 'build', 'site', 'examples');

export default (env, argv) => {
    // Collect all example javascript code
    const entry = {};
    fs.readdirSync(src)
        .map(name => name.replace(/\.html$/, ''))
        .forEach(example => {
            const jsFile = `${example}.js`;
            if (fs.existsSync(path.join(src, jsFile))) {
                entry[example] = [`./${jsFile}`];
            }
        });
    entry.index = [path.join(baseDir, '..', 'index.js')];

    return {
        watchOptions: {
            ignored: /node_modules/,
            poll: false,
        },
        context: src,
        resolve: {
            alias: {
                '@giro3d/giro3d': '../src',
            },
        },
        devtool: 'source-map',
        entry,
        target: ['web', 'es5'],
        output: {
            filename: '[name].js',
            clean: true,
            path: buildDir,
            library: '[name]',
            libraryTarget: 'umd',
            umdNamedDefine: true,
            devtoolModuleFilenameTemplate: 'webpack://[namespace]/[resource-path]?[loaders]',
            devtoolNamespace: 'giro3d',
        },
        optimization: {
            minimize: argv.mode === 'production',
        },
        devServer: {
            hot: true,
            client: {
                progress: true,
                overlay: true,
            },
            static: [
                {
                    directory: path.join(baseDir, '..'),
                    publicPath: '/',
                },
            ],
        },
        module: {
            rules: [
                {
                    test: /\.glsl$/,
                    use: {
                        loader: 'webpack-glsl-loader',
                    },
                    exclude: /node_modules/,
                },
            ],
        },
        plugins: [
            new ExampleBuilder({
                debug: argv.mode !== 'production',
                templates: path.join(baseDir, '..', 'templates'),
                examplesDir: path.join(baseDir, '..'),
                buildDir,
            }),
            new webpack.DefinePlugin({
                __DEBUG__: argv.mode !== 'production',
            }),
            new CopyPlugin({
                patterns: [
                    { from: 'css', to: 'css' },
                    { from: 'js', to: 'js' },
                    { from: 'image', to: 'image' },
                    { from: 'screenshots', to: 'screenshots' },
                    { from: 'data', to: 'data' },
                    { from: path.resolve(path.join(baseDir, '..', '..', 'node_modules', 'three', 'examples', 'jsm', 'loaders', 'ifc/web-ifc.wasm')) },
                ],
            }),
        ],
    };
};
