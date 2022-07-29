import CopyPlugin from 'copy-webpack-plugin';
import path, {dirname} from 'path';
import {fileURLToPath} from 'url';


const baseDir = dirname(fileURLToPath(import.meta.url));

const src = path.join(baseDir, '..');

export default {
    watchOptions: {
        ignored: /node_modules/,
        aggregateTimeout: 100,
        poll: true,
    },
    context: src,
    devtool: "source-map",
    entry: {
        giro3d: ['babel-polyfill', 'url-polyfill', 'whatwg-fetch', path.join(baseDir, 'giro3d.js')],
        debug: [path.join(baseDir, '..', '..', 'utils/debug/Main.js')],
    },
    target: ["web", "es5"],
    output: {
        filename: "[name].js",
        clean: true,
        path: path.join(baseDir, "..", "..", "build", "site", "examples"),
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
        new CopyPlugin({
            patterns: [
                { from: "css", to: "css" },
                { from: "js", to: "js" },
                { from: "layers", to: "layers" },
                { from: "screenshots", to: "screenshots" },
                "**/*.html",
                {
                    from: "**/*.html",
                },
            ],
        }),
    ],
};
