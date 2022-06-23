const fs = require('fs');
const path = require('path');
const webpack = require('webpack');

const debugBuild = process.env.NODE_ENV === 'development';
const definePlugin = new webpack.DefinePlugin({
    __DEBUG__: debugBuild,
});
const ESLintPlugin = require('eslint-webpack-plugin');

/*
   configuring babel:
   - when babel runs alone (for `test-unit` for instance), we let him deal with
   ES6 modules, because node doesn't support them yet (planned for v10 lts).
   - however, webpack also has ES6 module support and these 2 don't play well
   together. When running webpack (either `build` or `start` script), we prefer
   to rely on webpack loaders (much more powerful and gives more possibilities),
   so let's disable modules for babel here.
   - we also dynamise the value of __DEBUG__ according to the env var
*/
// Note that we don't support .babelrc in parent folders
const babelrc = fs.readFileSync(path.resolve(__dirname, 'babel.config.json'));
const babelConf = JSON.parse(babelrc);
const newPresets = [];
for (let preset of babelConf.presets) {
    if (!Array.isArray(preset)) {
        preset = [preset];
    }
    preset.push({ modules: false });
    newPresets.push(preset);
}
babelConf.presets = newPresets;
babelConf.babelrc = false; // disabel babelrc reading, as we've just done it
const replacementPluginConf = babelConf.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'minify-replace');
replacementPluginConf[1].replacements.find(decl => decl.identifierName === '__DEBUG__').replacement.value = debugBuild;

module.exports = {
    entry: {
        giro3d: ['babel-polyfill', 'url-polyfill', 'whatwg-fetch', path.resolve(__dirname, 'src/MainBundle.js')],
        debug: [path.resolve(__dirname, 'utils/debug/Main.js')],
    },
    devtool: 'source-map',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        library: '[name]',
        libraryTarget: 'umd',
        umdNamedDefine: true,
        devtoolModuleFilenameTemplate: 'webpack://[namespace]/[resource-path]?[loaders]',
        devtoolNamespace: 'giro3d',
    },
    plugins: [
        definePlugin,
        new ESLintPlugin(),
    ],
    module: {
        rules: [
            {
                test: /\.js$/,
                include: [
                    path.resolve(__dirname, 'src'),
                    path.resolve(__dirname, 'test'),
                    path.resolve(__dirname, 'utils'),
                ],
                loader: 'babel-loader',
                options: babelConf,
            },
        ],
    },
    devServer: {
        static: [
            {
                directory: path.join(__dirname, 'examples'),
                publicPath: '/',
            },
        ],
    },
};
