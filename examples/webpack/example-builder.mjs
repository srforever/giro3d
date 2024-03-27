import fse from 'fs-extra';
import path from 'path';
import sources from 'webpack-sources';
import frontMatter from 'front-matter';
import shiki from 'shiki';

const RawSource = sources.RawSource;
const relativeImportRegex = /\.\.\/src/;

let exampleId = 0;

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

function generateExampleCard(pathToHtmlFile, template) {
    const name = path.parse(pathToHtmlFile).name;
    const { attributes } = parseExample(pathToHtmlFile);
    exampleId++;
    return template
        .replaceAll('%title%', attributes.title)
        .replaceAll('%description%', attributes.shortdesc)
        .replaceAll('%id%', exampleId)
        .replaceAll('%name%', name);
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

export default class ExampleBuilder {
    /**
     * A webpack plugin that builds the html files for our examples.
     *
     * @param {object} config Plugin configuration.  Requires a `templates` property
     * with the path to templates and a `common` property with the name of the
     * common chunk.
     */
    constructor(config) {
        this.debug = config.debug;
        this.name = 'ExampleBuilder';
        this.templates = config.templates;
        this.examplesDir = config.examplesDir;
        this.rootDir = config.rootDir;
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

    generateExample(pathToHtmlFile, template, highlighter, giro3dVersion) {
        const filename = path.basename(pathToHtmlFile);

        const js = filename.replace('.html', '.js');

        const rawSourceCode = fse.readFileSync(pathToHtmlFile.replace('.html', '.js'), 'utf-8');

        const htmlCodeTemplate = fse.readFileSync(
            path.resolve(this.examplesDir, 'templates/published_html.tmpl'),
            'utf-8',
        );

        const packageJsonCode = fse.readFileSync(
            path.resolve(this.examplesDir, 'templates/published_package_json.tmpl'),
            'utf-8',
        );

        const name = path.parse(pathToHtmlFile).name;
        const { attributes, body } = parseExample(pathToHtmlFile);
        let customCss = '';
        const css = pathToHtmlFile.replace('.html', '.css');
        if (fse.existsSync(css)) {
            customCss = fse.readFileSync(css);
        }

        const htmlCode = htmlCodeTemplate
            .replaceAll('%content%', body.trim())
            .replaceAll('%customcss%', customCss)
            .replaceAll('%example_name%', attributes.title)
            .trim();

        const packageJson = packageJsonCode
            .replaceAll('%name%', name)
            .replaceAll('%giro3d_version%', giro3dVersion)
            .trim();

        const sourceCode = rawSourceCode
            .replaceAll(/import StatusBar from.*/gi, '')
            .replaceAll(/StatusBar\.bind[^;]*;/gim, '')
            .trim();

        const html = template
            .replaceAll('%title%', `${attributes.title}`)
            .replaceAll('%description%', attributes.shortdesc)
            .replaceAll('%long_description%', attributes.longdesc ?? '')
            .replaceAll('%attribution%', attributes.attribution ?? '')
            .replaceAll('%name%', name)
            .replaceAll(
                '%source_url%',
                `https://gitlab.com/giro3d/giro3d/-/tree/main/examples/${js}`,
            )
            .replaceAll('%js%', js)
            .replaceAll('%customcss%', customCss)
            .replaceAll('%code%', highlighter?.codeToHtml(sourceCode, { lang: 'js' }))
            .replaceAll('%html%', highlighter?.codeToHtml(htmlCode, { lang: 'html' }))
            .replaceAll('%package_json%', highlighter?.codeToHtml(packageJson, { lang: 'json' }))
            .replaceAll('%content%', body);

        return { filename, html };
    }

    async addAssets(assets) {
        const template = await fse.readFile(
            path.resolve(this.examplesDir, 'templates/thumbnail.tmpl'),
            'utf-8',
        );
        const index = await fse.readFile(
            path.resolve(this.examplesDir, 'templates/index.tmpl'),
            'utf-8',
        );

        const htmlFiles = (await fse.readdir(this.examplesDir))
            .filter(f => f.endsWith('.html'))
            .map(f => path.resolve(this.examplesDir, f));

        htmlFiles.forEach(f => validateExample(f));

        // generate an example card fragment for each example file
        const thumbnails = htmlFiles.map(f => generateExampleCard(f, template));

        let highlighter;
        if (!this.debug) {
            highlighter = await shiki.getHighlighter({
                theme: 'github-light',
                langs: ['js', 'html', 'json'],
            });
        }

        // Fill the index.html file with the example cards
        const html = index.replace('%examples%', thumbnails.join('\n\n'));

        assets['index.html'] = new RawSource(html);

        const templateFile = this.debug ? 'templates/example-dev.tmpl' : 'templates/example.tmpl';
        const exampleTemplate = await fse.readFile(
            path.resolve(this.examplesDir, templateFile),
            'utf-8',
        );

        const packageJsonPath = path.resolve(this.rootDir, 'package.json');
        const packageJson = await fse.readFile(packageJsonPath, 'utf-8');
        const giro3dVersion = JSON.parse(packageJson).version;

        htmlFiles
            .map(f => this.generateExample(f, exampleTemplate, highlighter, giro3dVersion))
            .forEach(ex => {
                assets[ex.filename] = new RawSource(ex.html);
            });
    }
}
