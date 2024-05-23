import esMain from 'es-main';
import fse from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import chokidar from 'chokidar';
import { program } from 'commander';
import glob from 'glob';
import ejs from 'ejs';

import { createStaticServer } from './serve.mjs';

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(baseDir, '..');
const siteDir = path.join(rootDir, 'site');
const graphicsDir = path.join(rootDir, 'graphics');
const templatesDir = path.join(baseDir, 'templates');

export const defaultParameters = {
    output: path.join(rootDir, 'build', 'site'),
};

function readTemplate(template) {
    const templateFilename = path.basename(template);
    return ejs.compile(fse.readFileSync(template, 'utf-8'), {
        templateFilename,
        root: rootDir,
        views: [templatesDir],
    });
}

export async function copyAssets(parameters) {
    const assetsDir = path.join(parameters.output, 'assets');
    const fontsDir = path.join(assetsDir, 'fonts');
    const imagesDir = path.join(parameters.output, 'images');
    fse.mkdirpSync(fontsDir);
    fse.mkdirpSync(imagesDir);

    const scss = ['bootstrap-custom', 'index'];

    scss.forEach(scss => {
        execSync(
            `npx sass ${path.join(siteDir, `${scss}.scss`)}:${path.join(assetsDir, `${scss}.css`)}`,
        );
    });

    fse.copySync(
        path.join(rootDir, 'node_modules', 'bootstrap', 'dist', 'js', 'bootstrap.bundle.min.js'),
        path.join(assetsDir, 'bootstrap.bundle.min.js'),
    );

    fse.copySync(path.join(rootDir, 'node_modules', 'bootstrap-icons', 'font', 'fonts'), fontsDir);
    fse.copySync(graphicsDir, imagesDir);
    fse.copySync(
        path.join(graphicsDir, 'favicon.svg'),
        path.join(parameters.output, 'favicon.svg'),
    );
}

export async function copySite(parameters) {
    const ejsFiles = glob.sync(path.join(rootDir, 'site', '*.ejs'));
    ejsFiles.forEach(ejsFile => {
        const filename = path.basename(ejsFile);
        const htmlFilename = filename.replace('.ejs', '.html');

        const htmlTemplate = readTemplate(ejsFile);
        const htmlContent = htmlTemplate().trim();

        fse.outputFileSync(path.join(parameters.output, htmlFilename), htmlContent);
    });
}

export async function build(parameters) {
    await copyAssets(parameters);
    await copySite(parameters);
}

async function handleModification(parameters, sourceFile) {
    console.log(`\nModified: ${path.basename(sourceFile)}, rebuilding...`);
    await build({
        ...parameters,
        clean: false,
    });
    console.log('Rebuilt!');
}

async function serve(parameters) {
    chokidar.watch([siteDir, graphicsDir]).on('change', p => handleModification(parameters, p));

    return createStaticServer(parameters.output, parameters.output);
}

/**
 * If running this module directly, read the config file, call the main
 * function, and write the output file.
 */
if (esMain(import.meta)) {
    program
        .option('-o, --output <directory>', 'Output directory', defaultParameters.output)
        .option('-c, --clean', 'Clean directory', defaultParameters.clean)
        .option('-w, --watch', 'Serve and watch for modifications', false);

    program.parse();

    const { watch, ...options } = program.opts();
    // eslint-disable-next-line no-undef
    const pwd = process.cwd();
    options.output = path.resolve(pwd, options.output);

    await build(options);
    if (watch) {
        await serve(options);
    }
}
