import esMain from 'es-main';
import fse from 'fs-extra';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
import { program } from 'commander';
import TypeDoc, { TypeDocReader, PackageJsonReader, TSConfigReader } from 'typedoc';

import { createStaticServer } from './serve.mjs';
import { copyAssets } from './build-static-site.mjs';

const baseDir = dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(baseDir, '..');
const apidocDir = path.join(rootDir, 'apidoc');
const sourceDir = path.join(rootDir, 'src');

export const defaultParameters = {
    output: path.join(rootDir, 'build', 'site', 'apidoc'),
    clean: true,
    version: undefined,
};

export async function cleanApidoc(parameters) {
    console.log('Cleaning output directory...');
    fse.removeSync(parameters.output);
}

export async function buildApidoc(parameters) {
    if (!parameters.version) {
        const pkg = await fse.readJSON(path.join(rootDir, 'package.json'));
        parameters.version = pkg.version;
    }

    console.log('Building documentation...');
    const app = await TypeDoc.Application.bootstrapWithPlugins(
        {
            entryPoints: [path.join(sourceDir, 'index.ts')],
            theme: 'custom',
            plugin: [path.join(apidocDir, 'theme.js')],
            name: `Giro3D API (${parameters.version})`,
            readme: path.join(apidocDir, 'README.md'),
            basePath: sourceDir,
            titleLink: '/',
            excludeInternal: true,
            excludeExternals: true,
            navigationLinks: {},
            tsconfig: path.join(rootDir, 'tsconfig.json'),
            customCss: path.join(apidocDir, 'theme.css'),
        },
        [new TypeDocReader(), new PackageJsonReader(), new TSConfigReader()],
    );

    const project = await app.convert();

    if (!project) {
        throw new Error('Compile error');
    }

    app.validate(project);
    if (app.logger.hasErrors()) {
        throw new Error('Validation errors');
    }

    // Render doc
    await app.generateDocs(project, parameters.output);

    if (app.logger.hasErrors()) {
        throw new Error('Output error');
    }
}

async function handleModification(parameters, sourceFile) {
    console.log(`\nModified: ${path.basename(sourceFile)}, rebuilding...`);
    await buildApidoc(parameters);
    console.log('Rebuilt!');
}

async function watchApidoc(parameters) {
    chokidar
        .watch([`${sourceDir}/**/*.ts`, apidocDir])
        .on('change', p => handleModification(parameters, p));
}

async function serveApidoc(parameters) {
    await watchApidoc(parameters);
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
        .option('-w, --watch', 'Serve and watch for modifications', false);

    program.parse();

    const { watch, clean, ...options } = program.opts();
    // eslint-disable-next-line no-undef
    const pwd = process.cwd();
    options.output = path.resolve(pwd, options.output);

    if (clean) {
        await cleanApidoc(options);
    }

    await copyAssets({
        output: path.join(options.output, '..'),
    });

    await buildApidoc(options);
    if (watch) {
        await serveApidoc(options);
    }
}
