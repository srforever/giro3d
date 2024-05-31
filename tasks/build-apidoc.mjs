import esMain from 'es-main';
import fse from 'fs-extra';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chokidar from 'chokidar';
import { program } from 'commander';

import { createStaticServer } from './serve.mjs';
import { copyAssets } from './build-static-site.mjs';
import { getGitVersion, getPackageVersion } from './prepare-package.mjs';
import { log, logWatched, logOk } from './utils.mjs';

const baseDir = dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(baseDir, '..');
const apidocDir = path.join(rootDir, 'apidoc');
const sourceDir = path.join(rootDir, 'src');
const tmpDir = path.join(rootDir, 'build', '.cache', 'apidoc');

export const defaultParameters = {
    output: path.join(rootDir, 'build', 'site', 'next', 'apidoc'),
    clean: true,
    version: undefined,
    releaseName: 'next',
};

export async function cleanApidoc(parameters) {
    log('apidoc', 'Cleaning output directory...');
    fse.removeSync(parameters.output);
    fse.removeSync(tmpDir);
}

export async function buildApidoc(parameters) {
    if (!parameters.version) {
        if (parameters.releaseName === 'next') {
            parameters.version = await getGitVersion();
        } else {
            parameters.version = await getPackageVersion();
        }
    }

    fse.mkdirpSync(tmpDir);
    const typedocConfigPath = path.join(tmpDir, 'typedoc.json');

    fse.writeJsonSync(typedocConfigPath, {
        $schema: 'https://typedoc.org/schema.json',
        entryPoints: [path.join(sourceDir, 'index.ts')],
        tsconfig: path.join(rootDir, 'tsconfig.json'),
        out: parameters.output,
        theme: 'custom',
        plugin: [path.join(apidocDir, 'theme.js')],
        name: `Giro3D API (${parameters.version})`,
        readme: path.join(apidocDir, 'README.md'),
        basePath: sourceDir,
        customCss: path.join(apidocDir, 'theme.css'),
        titleLink: '/',
        excludeInternal: true,
        excludeExternals: true,
        navigationLinks: {},
        releaseName: parameters.releaseName,
        releaseVersion: parameters.version,
    });

    log('apidoc', 'Building documentation...');
    if (parameters.lintOnly) {
        execSync(`npx typedoc --options ${typedocConfigPath} --emit none`);
    } else {
        execSync(`npx typedoc --options ${typedocConfigPath}`);
    }
    logOk('apidoc', `Built documentation at ${parameters.output}`);
}

async function handleModification(parameters, sourceFile) {
    logWatched('apidoc', path.basename(sourceFile));
    await buildApidoc(parameters);
}

async function watchApidoc(parameters) {
    chokidar
        .watch([`${sourceDir}/**/*.ts`, apidocDir])
        .on('change', p => handleModification(parameters, p));
}

async function serveApidoc(parameters) {
    await watchApidoc(parameters);
    log('apidoc', 'Starting server...');
    return createStaticServer(parameters.output, path.join(parameters.output, '..'));
}

/**
 * If running this module directly, read the config file, call the main
 * function, and write the output file.
 */
if (esMain(import.meta)) {
    program
        .option('-o, --output <directory>', 'Output directory', defaultParameters.output)
        .option('-c, --clean', 'Clean output directory', defaultParameters.clean)
        .option('--no-clean', "Don't clean")
        .option('-v, --version <version>', 'Version', defaultParameters.version)
        .option(
            '-r, --release-name <name>',
            'Release name (latest, next, ...)',
            defaultParameters.releaseName,
        )
        .option('-w, --watch', 'Serve and watch for modifications', false)
        .option('--lint-only', 'Lint only', false);

    program.parse();

    const { watch, clean, ...options } = program.opts();
    // eslint-disable-next-line no-undef
    const pwd = process.cwd();
    options.output = path.resolve(pwd, options.output);

    if (!options.lintOnly) {
        if (clean) {
            await cleanApidoc(options);
        }

        await copyAssets({
            output: path.join(options.output, '..'),
        });
    }

    await buildApidoc(options);
    if (watch) {
        await serveApidoc(options);
    }
}
