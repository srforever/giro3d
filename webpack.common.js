const path = require("path");
const ESLintPlugin = require("eslint-webpack-plugin");
const webpack = require("webpack");

module.exports = {
    entry: {
        giro3d: [
            "babel-polyfill",
            "url-polyfill",
            "whatwg-fetch",
            path.resolve(__dirname, "src/MainBundle.js"),
        ],
        debug: [path.resolve(__dirname, "utils/debug/Main.js")],
    },
    plugins: [
        new webpack.DefinePlugin({
            __DEBUG__: process.env.NODE_ENV === "development",
        }),
        new ESLintPlugin(),
    ],
    module: {
        rules: [
            {
                test: /\.jsx?$/i,
                include: [
                    path.resolve(__dirname, "src"),
                    path.resolve(__dirname, "test"),
                    path.resolve(__dirname, "utils"),
                ],
                use: {
                    loader: "babel-loader",
                    options: {
                        cacheDirectory: true,
                    }
                },
            },
        ],
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].js",
        library: "[name]",
        clean: true,
        libraryTarget: "umd",
        umdNamedDefine: true,
        devtoolModuleFilenameTemplate: "webpack://[namespace]/[resource-path]?[loaders]",
        devtoolNamespace: "giro3d",
    },
};
