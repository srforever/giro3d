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

    const babelConfFile = argv.mode === 'production' ? 'babel.config.json' : 'babel.config.dev.json';
    const babelrc = fs.readFileSync(path.join(baseDir, '..', '..', babelConfFile));
    const babelConf = JSON.parse(babelrc);

    // Collect all example javscript code
    const entry = {};
    fs.readdirSync(src)
        .map((name) => name.replace(/\.html$/, ''))
        .forEach((example) => {
            const jsFile = `${example}.js`;
            if (fs.existsSync(path.join(src, jsFile))) {
                entry[example] = [`./${jsFile}`];
            }
        });
    entry.index = [path.join(baseDir, '..', 'index.js')];

    return {
        watchOptions: {
            ignored: /node_modules/,
            aggregateTimeout: 100,
            poll: true,
        },
        context: src,
        devtool: "source-map",
        entry,
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
        optimization: {
            minimize: false,
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
                    use: {
                        loader: "babel-loader",
                        options: babelConf
                    },
                    exclude: /node_modules/,
                }
            ],
        },
        plugins: [
            new ExampleBuilder({
                templates: path.join(baseDir, '..', 'templates'),
                examplesDir: path.join(baseDir, '..'),
                buildDir: buildDir,
                strictMode: argv.mode === 'production'
            }),
            new CopyPlugin({
                patterns: [
                    { from: "css", to: "css" },
                    { from: "js", to: "js" },
                    { from: "screenshots", to: "screenshots" }
                ],
            }),
        ],
    }
};
