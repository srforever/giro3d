import fse from 'fs-extra';
import path from 'path';
import { JSDOM } from 'jsdom';
import sources from 'webpack-sources';

const RawSource = sources.RawSource;

function generateExampleCard(pathToHtmlFile, template) {
    const name = path.parse(pathToHtmlFile).name;
    const values = parseExample(pathToHtmlFile);
    return template
        .replaceAll('%title%', values.name)
        .replaceAll('%description%', values.description)
        .replaceAll('%name%', name);
}

function parseExample(pathToHtmlFile) {
    const html = fse.readFileSync(pathToHtmlFile, 'utf-8');
    const document = new JSDOM(html).window.document;

    const name = document.querySelector('meta[name=name]')?.getAttribute('content');
    const description = document.querySelector('meta[name=description]')?.getAttribute('content');

    if (!name) {
        throw new Error(`${pathToHtmlFile}: missing <meta name="name"> element`);
    }
    if (!description) {
        throw new Error(`${pathToHtmlFile}: missing <meta name="description"> element`);
    }

    return { name, description };
}

export default class ExampleBuilder {
    /**
     * A webpack plugin that builds the html files for our examples.
     *
     * @param {object} config Plugin configuration.  Requires a `templates` property
     * with the path to templates and a `common` property with the name of the
     * common chunk.
     */
    constructor(config) {
        this.name = 'ExampleBuilder';
        this.templates = config.templates;
        this.examplesDir = config.examplesDir;
        this.buildDir = config.buildDir;
    }

    /**
     * Called by webpack.
     *
     * @param {object} compiler The webpack compiler.
     */
    apply(compiler) {
        compiler.hooks.compilation.tap(this.name, compilation => {
            compilation.hooks.additionalAssets.tapPromise(this.name, async () => {
                await this.addAssets(compilation.assets, compiler.context);
            });
        });
    }

    async addAssets(assets, dir) {
        const template = await fse.readFile(path.resolve(this.examplesDir, 'templates/thumbnail.tmpl'), 'utf-8');
        const index = await fse.readFile(path.resolve(this.examplesDir, 'templates/index.tmpl'), 'utf-8');

        const htmlFiles = (await fse.readdir(this.examplesDir))
            .filter(f => f.endsWith('.html'))
            .map(f => path.resolve(this.examplesDir, f))

        // generate an example card fragment for each example file
        const thumbnails = htmlFiles.map(f => generateExampleCard(f, template));

        // Fill the index.html file with the example cards
        const html = index.replace('%examples%', thumbnails.join('\n\n'));

        assets['index.html'] = new RawSource(html);
    }
}
