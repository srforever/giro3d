import fse from 'fs-extra';
import path from 'path';
import sources from 'webpack-sources';
import frontMatter from 'front-matter';

const RawSource = sources.RawSource;
const relativeImportRegex = /\.\.\/src/;

function generateExampleCard(pathToHtmlFile, template) {
    const name = path.parse(pathToHtmlFile).name;
    const { attributes } = parseExample(pathToHtmlFile);
    return template
        .replaceAll('%title%', attributes.title)
        .replaceAll('%description%', attributes.shortdesc)
        .replaceAll('%name%', name);
}

function generateExample(pathToHtmlFile, template) {
    const filename = path.basename(pathToHtmlFile);
    const js = filename.replace('.html', '.js');
    const name = path.parse(pathToHtmlFile).name;
    const { attributes, body } = parseExample(pathToHtmlFile);
    const html = template
        .replaceAll('%title%', `${attributes.title} - Giro3D`)
        .replaceAll('%description%', attributes.shortdesc)
        .replaceAll('%name%', name)
        .replaceAll('%source_url%', `https://gitlab.com/giro3d/giro3d/-/tree/master/examples/${js}`)
        .replaceAll('%js%', js)
        .replaceAll('%content%', body);

    return { filename, html };
}

function validateExample(pathToHtmlFile) {
    const jsFile = pathToHtmlFile.replace('.html', '.js');
    const html = fse.readFileSync(jsFile, 'utf-8');
    if (relativeImportRegex.test(html)) {
        const filename = path.basename(jsFile);
        throw new Error(
            `${filename}: relative import path detected. Use absolute path in the form @giro3d\\giro3d`,
        );
    }
}

function parseExample(pathToHtmlFile) {
    const html = fse.readFileSync(pathToHtmlFile, 'utf-8');

    const { attributes, body } = frontMatter(html);

    if (!attributes.title) {
        throw new Error(`${pathToHtmlFile}: missing <title> YAML attribute`);
    }
    if (!attributes.shortdesc) {
        throw new Error(`${pathToHtmlFile}: missing <shortdesc> YAML attribute`);
    }

    return { attributes, body };
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
            .map(f => path.resolve(this.examplesDir, f));

        htmlFiles.forEach(f => validateExample(f));

        // generate an example card fragment for each example file
        const thumbnails = htmlFiles.map(f => generateExampleCard(f, template));

        // Fill the index.html file with the example cards
        const html = index.replace('%examples%', thumbnails.join('\n\n'));

        assets['index.html'] = new RawSource(html);

        const exampleTemplate = await fse.readFile(path.resolve(this.examplesDir, 'templates/example.tmpl'), 'utf-8');

        htmlFiles
            .map(f => generateExample(f, exampleTemplate))
            .forEach(ex => {
                assets[ex.filename] = new RawSource(ex.html);
            });
    }
}
