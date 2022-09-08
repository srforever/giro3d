import fse from 'fs-extra';
import path from 'path';
import sources from 'webpack-sources';
import frontMatter from 'front-matter';

const RawSource = sources.RawSource;

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
        this.strictMode = config.strictMode;
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
        const thumbnails = htmlFiles.map(f => this._generateExampleCard(f, template)).filter(v => !!v);

        // Fill the index.html file with the example cards
        const html = index.replace('%examples%', thumbnails.join('\n\n'));

        assets['index.html'] = new RawSource(html);

        const exampleTemplate = await fse.readFile(path.resolve(this.examplesDir, 'templates/example.tmpl'), 'utf-8');

        htmlFiles
            .map(f => this._generateExample(f, exampleTemplate))
            .forEach(ex => {
                if (ex) {
                    assets[ex.filename] = new RawSource(ex.html);
                }
            });
    }

    _generateExampleCard(pathToHtmlFile, template) {
        const name = path.parse(pathToHtmlFile).name;
        const info = this._parseExample(pathToHtmlFile);
        if (!info) {
            return null;
        }
        return template
            .replaceAll('%title%', info.attributes.title)
            .replaceAll('%description%', info.attributes.shortdesc)
            .replaceAll('%name%', name);
    }

    _generateExample(pathToHtmlFile, template) {
        const filename = path.basename(pathToHtmlFile);
        const js = filename.replace('.html', '.js');
        const name = path.parse(pathToHtmlFile).name;
        const info  = this._parseExample(pathToHtmlFile);
        if (!info) {
            return null;
        }
        const { attributes, body } = info;
        const html = template
            .replaceAll('%title%', `${attributes.title} - Giro3D`)
            .replaceAll('%description%', attributes.shortdesc)
            .replaceAll('%name%', name)
            .replaceAll('%source_url%', `https://gitlab.com/giro3d/giro3d/-/tree/master/examples/${js}`)
            .replaceAll('%js%', js)
            .replaceAll('%content%', body);

        return { filename, html };
    }

    _parseExample(pathToHtmlFile) {
        const html = fse.readFileSync(pathToHtmlFile, 'utf-8');

        const { attributes, body } = frontMatter(html);

        let errMsg;
        if (!attributes.title) {
            errMsg = `${pathToHtmlFile}: missing <title> YAML attribute`;
            if (this.strictMode) {
                throw new Error(errMsg);
            }
            console.warn(errMsg);
        }
        if (!attributes.shortdesc) {
            errMsg = `${pathToHtmlFile}: missing <shortdesc> YAML attribute`;
            if (this.strictMode) {
                throw new Error(errMsg);
            }
            console.warn(errMsg);
        }
        if (errMsg) {
            return null;
        }

        return { attributes, body };
    }
}
