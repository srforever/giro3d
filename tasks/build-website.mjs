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
const root = '/home/tmuguet/projects/giro3d-org/dist';

async function buildRelease(parameters, releaseName) {
    await buildApidoc({
        output: path.join(parameters.output, releaseName, 'apidoc'),
        publishedVersion: releaseName,
    });
    await buildExamples({
        output: path.join(parameters.output, releaseName, 'examples'),
        mode: 'production',
        publishedVersion: releaseName,
    });
    await buildTutorials({
        output: path.join(parameters.output, releaseName, 'tutorials'),
        publishedVersion: releaseName,
    });

    if (parameters.push) {
        if (fse.existsSync(path.join(root, releaseName))) {
            fse.removeSync(path.join(root, releaseName));
        }

        fse.mkdirpSync(path.join(root, releaseName));
        fse.copySync(path.join(parameters.output, releaseName), path.join(root, releaseName));
    }
}

async function buildWebsite(parameters) {
    await buildStaticSite({
        output: parameters.output,
        publishedVersion: parameters.release ? 'latest' : 'next',
    });

    if (parameters.push) {
        fse.mkdirpSync(root);
        fse.copySync(path.join(parameters.output), root);
    }

    if (parameters.release) {
        await buildRelease(parameters, 'latest');
    }

    await buildRelease(parameters, 'next');
}

if (esMain(import.meta)) {
    program
        .option('-o, --output <directory>', 'Output directory', defaultParameters.output)
        .option('--release', 'Released version', false)
        .option('--push', 'Push site', false)
        .option('-w, --watch', 'Serve and watch for modifications', false);

    program.parse();

    const { watch, ...options } = program.opts();
    // eslint-disable-next-line no-undef
    const pwd = process.cwd();
    options.output = path.resolve(pwd, options.output);

    await buildWebsite(options);
    if (watch) {
        await createStaticServer(options.output, options.output);
    }
}
