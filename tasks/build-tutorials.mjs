import esMain from 'es-main';
import ejs from 'ejs';
import fse from 'fs-extra';
import docco from 'docco-next';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
import { program } from 'commander';

import { parseExample, parseCss } from './build-examples.mjs';
import { createStaticServer } from './serve.mjs';

const baseDir = dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(baseDir, '..');
const examplesDir = path.join(rootDir, 'examples');
const siteDir = path.join(rootDir, 'site');
const templatesDir = path.join(baseDir, 'templates');

// List of tutorials to build (i.e. files in the examples folder)
export const TUTORIALS = {
    'getting-started.js': {
        name: 'Getting started',
        title: 'Getting started',
    },
};

export const defaultParameters = {
    output: path.join(rootDir, 'build', 'site', 'tutorials'),
    clean: true,
};

export async function cleanTutorials(parameters) {
    console.log('Cleaning output directory...');
    fse.removeSync(parameters.output);
}

export async function buildTutorials(parameters) {
    // eslint-disable-next-line no-undef
    const pwd = process.cwd();
    const tmpDir = path.join(parameters.output, '.docco');

    fse.ensureDirSync(tmpDir);
    const relativeOutput = path.relative(pwd, examplesDir);
    if (
        relativeOutput.startsWith('.') ||
        relativeOutput.startsWith('/') ||
        relativeOutput.startsWith('\\')
    ) {
        // Might have side-effects and I don't want to spend too much time testing, so disable it
        throw new Error(
            'examples directory is not a subdirectory of the current working directory; this is not supported',
        );
    }

    try {
        // We actually generate new EJS templates 🤯
        await docco.run([
            '-css',
            path.join(siteDir, 'docco.css'),
            '-s',
            'github-light',
            '-l',
            'parallel',
            '-t',
            path.join(templatesDir, 'tutorial.ejs'),
            '--output',
            tmpDir,
            ...Object.keys(TUTORIALS).map(t => `${relativeOutput}/${t}`),
        ]);

        for (const [jsFilename, metadata] of Object.entries(TUTORIALS)) {
            const htmlFilename = jsFilename.replace('.js', '.html');
            const pathToHtmlFile = path.join(examplesDir, htmlFilename);

            const name = path.parse(pathToHtmlFile).name;
            const { attributes, body } = parseExample(pathToHtmlFile);
            const customCss = parseCss(pathToHtmlFile);

            const variables = {
                content: body.trim(),
                customcss: customCss,
                example_name: attributes.title,
                name: name,
                title: attributes.title,
                description: attributes.shortdesc,
                long_description: attributes.longdesc ?? '',
                attribution: attributes.attribution ?? '',
                js: jsFilename,
                ...metadata,
            };

            const template = ejs.compile(
                fse.readFileSync(path.join(tmpDir, relativeOutput, htmlFilename), 'utf-8'),
                {
                    htmlFilename,
                    root: rootDir,
                    views: [templatesDir],
                },
            );

            const content = template(variables);
            fse.outputFileSync(path.join(parameters.output, htmlFilename), content);
        }

        fse.copyFileSync(
            path.join(siteDir, 'docco.css'),
            path.join(parameters.output, 'docco.css'),
        );
        if (!fse.pathExistsSync(path.join(parameters.output, 'public'))) {
            fse.moveSync(path.join(tmpDir, 'public'), path.join(parameters.output, 'public'));
        }
    } finally {
        fse.removeSync(tmpDir);
    }
}

async function handleModification(parameters, sourceFile) {
    console.log(`\nModified: ${path.basename(sourceFile)}, rebuilding...`);
    await buildTutorials(parameters);
    console.log('Rebuilt!');
}

async function watchTutorials(parameters) {
    chokidar
        .watch([
            // docco might have some cache; watching on the template does not work
            // path.join(parameters.templates, 'tutorial.ejs'),
            ...Object.keys(TUTORIALS).map(jsFileName => path.join(examplesDir, jsFileName)),
            ...Object.keys(TUTORIALS).map(jsFileName =>
                path.join(examplesDir, jsFileName.replace('.js', '.html')),
            ),
            ...Object.keys(TUTORIALS)
                .map(jsFileName => path.join(examplesDir, jsFileName.replace('.js', '.css')))
                .filter(path => fse.existsSync(path)),
        ])
        .on('change', p => handleModification(parameters, p));
}

async function serveTutorials(parameters) {
    await watchTutorials(parameters);
    return createStaticServer(
        path.join(parameters.output, '..'),
        path.join(parameters.output, '..'),
    );
}

if (esMain(import.meta)) {
    program
        .option('-o, --output <directory>', 'Output directory', defaultParameters.output)
        .option('-c, --clean', 'Clean output directory', defaultParameters.clean)
        .option('--no-clean', "Don't clean")
        .option('-w, --watch', 'Serve and watch for modifications', false);

    program.parse();

    const { watch, clean, ...options } = program.opts();
    // eslint-disable-next-line no-undef
    const pwd = process.cwd();
    options.output = path.resolve(pwd, options.output);

    if (clean) {
        await cleanTutorials(options);
    }

    await buildTutorials(options);
    if (watch) {
        await serveTutorials(options);
    }
}
