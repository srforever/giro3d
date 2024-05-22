import esMain from 'es-main';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import webpack from 'webpack';
import webpackDevServer from 'webpack-dev-server';
import { program } from 'commander';

const baseDir = dirname(fileURLToPath(import.meta.url));

export const defaultParameters = {
    directory: path.join(baseDir, '..', 'build', 'site'),
    siteDirectory: path.join(baseDir, '..', 'build', 'site'),
};

export function createStaticServer(rootDir, siteDir) {
    const webpackConfig = {
        mode: 'development',
        watchOptions: {
            ignored: /node_modules/,
            poll: false,
        },
        entry: {},
        devtool: 'source-map',
        devServer: {
            hot: true,
            client: {
                progress: true,
                overlay: true,
            },
            static: [
                {
                    directory: rootDir,
                    publicPath: '/',
                },
                {
                    directory: path.join(siteDir, 'assets'),
                    publicPath: '/assets/',
                },
                {
                    directory: path.join(siteDir, 'images'),
                    publicPath: '/images/',
                },
            ],
        },
    };

    const compiler = webpack(webpackConfig);
    const server = new webpackDevServer(webpackConfig.devServer, compiler);

    console.log('Starting server...');
    return server.start();
}

if (esMain(import.meta)) {
    program
        .option('-d, --directory <directory>', 'Directory to serve', defaultParameters.directory)
        .option(
            '-s, --site-directory <directory>',
            'Site directory for assets and images',
            defaultParameters.siteDirectory,
        );

    program.parse();

    const options = program.opts();
    // eslint-disable-next-line no-undef
    const pwd = process.cwd();
    options.directory = path.resolve(pwd, options.directory);
    options.siteDirectory = path.resolve(pwd, options.siteDirectory);

    createStaticServer(options.directory, options.siteDirectory);
}
