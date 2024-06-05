import esMain from 'es-main';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import chalk from 'chalk';

import { buildStaticSite } from './build-static-site.mjs';
import { buildApidoc } from './build-apidoc.mjs';
import { buildExamples } from './build-examples.mjs';
import { buildTutorials } from './build-tutorials.mjs';
import { createStaticServer } from './serve.mjs';
import { log, logOk } from './utils.mjs';

const baseDir = dirname(fileURLToPath(import.meta.url));

export const defaultParameters = {
    output: path.join(baseDir, '..', 'build', 'site'),
};

async function buildRelease(parameters, releaseName) {
    log('site', chalk.bold(`Building release ${releaseName}...`));
    await buildApidoc({
        output: path.join(parameters.output, releaseName, 'apidoc'),
        releaseName,
    });
    await buildExamples({
        output: path.join(parameters.output, releaseName, 'examples'),
        mode: 'production',
        releaseName,
    });
    await buildTutorials({
        output: path.join(parameters.output, releaseName, 'tutorials'),
        releaseName,
    });
    logOk('site', chalk.bold(`Built release ${releaseName}`));
}

async function buildWebsite(parameters) {
    await buildStaticSite({
        output: parameters.output,
        releaseName: parameters.useNext ? 'next' : 'latest',
    });

    if (parameters.buildLatest) {
        await buildRelease(parameters, 'latest');
    }

    await buildRelease(parameters, 'next');
}

if (esMain(import.meta)) {
    program
        .option('-o, --output <directory>', 'Output directory', defaultParameters.output)
        .option('--build-latest', 'Also build as latest version', false)
        .option('--use-next', 'Use next version for static site', false)
        .option('-w, --watch', 'Serve and watch for modifications', false);

    program.parse();

    const { watch, ...options } = program.opts();
    const pwd = process.cwd();
    options.output = path.resolve(pwd, options.output);

    await buildWebsite(options);
    if (watch) {
        await createStaticServer(options.output);
    }
}
