import esMain from 'es-main';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import fse from 'fs-extra';

import { buildStaticSite } from './build-static-site.mjs';
import { buildApidoc } from './build-apidoc.mjs';
import { buildExamples } from './build-examples.mjs';
import { buildTutorials } from './build-tutorials.mjs';
import { createStaticServer } from './serve.mjs';

const baseDir = dirname(fileURLToPath(import.meta.url));

export const defaultParameters = {
    output: path.join(baseDir, '..', 'build', 'site'),
};

async function buildRelease(parameters, releaseName) {
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
}

async function buildWebsite(parameters) {
    await buildStaticSite({
        output: parameters.output,
        releaseName: parameters.release ? 'latest' : 'next',
    });

    if (parameters.release) {
        await buildRelease(parameters, 'latest');
    }

    await buildRelease(parameters, 'next');
}

if (esMain(import.meta)) {
    program
        .option('-o, --output <directory>', 'Output directory', defaultParameters.output)
        .option('--release', 'Released version', false)
        .option('-w, --watch', 'Serve and watch for modifications', false);

    program.parse();

    const { watch, ...options } = program.opts();
    // eslint-disable-next-line no-undef
    const pwd = process.cwd();
    options.output = path.resolve(pwd, options.output);

    await buildWebsite(options);
    if (watch) {
        await createStaticServer(options.output);
    }
}
