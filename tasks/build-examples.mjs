import esMain from 'es-main';
import fse from 'fs-extra';
import ejs from 'ejs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import chokidar from 'chokidar';
import webpack from 'webpack';
import webpackDevServer from 'webpack-dev-server';
import CopyPlugin from 'copy-webpack-plugin';
import frontMatter from 'front-matter';
import shiki from 'shiki';

import { handleModification } from '../observer.mjs';
import { copyAssets } from './build-static-site.mjs';
import { getGitVersion, getPackageVersion } from './prepare-package.mjs';
import { log, logOk } from './utils.mjs';

const baseDir = dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(baseDir, '..');
const examplesDir = path.join(rootDir, 'examples');
const templatesDir = path.join(rootDir, 'site', 'templates');
const giro3dPackageDir = path.join(rootDir, 'build', 'giro3d');

export const defaultParameters = {
    output: path.join(rootDir, 'build', 'site', 'next', 'examples'),
    version: undefined,
    releaseName: 'next',
    mode: 'production',
    clean: true,
};

const relativeImportRegex = /\.\.\/src/;

let exampleId = 0;

export function parseExample(pathToHtmlFile) {
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

export function parseCss(pathToHtmlFile) {
    let customCss = '';
    const pathToCssFile = pathToHtmlFile.replace('.html', '.css');
    if (fse.existsSync(pathToCssFile)) {
        const cssStyle = fse.readFileSync(pathToCssFile, 'utf-8');
        customCss = '<style>\n' + cssStyle.trim() + '\n</style>';
    }
    return customCss;
}

function getExampleCard(pathToHtmlFile) {
    const name = path.parse(pathToHtmlFile).name;
    const { attributes } = parseExample(pathToHtmlFile);
    exampleId++;
    return {
        title: attributes.title,
        description: attributes.shortdesc,
        tags: attributes.tags,
        id: exampleId,
        name,
    };
}

function validateExample(pathToHtmlFile) {
    const jsFile = pathToHtmlFile.replace('.html', '.js');
    const js = fse.readFileSync(jsFile, 'utf-8');
    if (relativeImportRegex.test(js)) {
        const filename = path.basename(jsFile);
        throw new Error(
            `${filename}: relative import path detected. Use absolute path in the form @giro3d\\giro3d`,
        );
    }
}

function readTemplate(templateFilename) {
    const template = path.join(templatesDir, templateFilename);
    return ejs.compile(fse.readFileSync(template, 'utf-8'), {
        templateFilename,
        root: rootDir,
        views: [templatesDir],
    });
}

export function getExamplesFiles() {
    const htmlFiles = fse
        .readdirSync(examplesDir)
        .filter(f => f.endsWith('.html'))
        .map(f => path.resolve(examplesDir, f));

    htmlFiles.forEach(f => validateExample(f));
    return htmlFiles;
}

export function findExamples() {
    return fse
        .readdirSync(examplesDir)
        .filter(name => name.endsWith('.html'))
        .map(name => name.replace(/\.html$/, ''))
        .filter(example => {
            const jsFile = `${example}.js`;
            return fse.existsSync(path.join(examplesDir, jsFile));
        });
}

export function findExamplesEntries() {
    const entry = {
        index: [path.join(examplesDir, 'index.js')],
    };
    const examples = findExamples(examplesDir);
    examples.forEach(example => {
        const jsFile = `${example}.js`;
        entry[example] = [path.join(examplesDir, jsFile)];
    });
    return entry;
}

export async function generateIndex(htmlFiles, parameters) {
    const thumbnails = htmlFiles.map(f => getExampleCard(f));

    log('examples', `Generating ${thumbnails.length} examples...`);

    const indexHtmlTemplate = readTemplate('index.ejs');
    const indexHtmlContent = indexHtmlTemplate({
        title: `Giro3D - Examples (${parameters.version})`,
        name: `Giro3D - Examples (${parameters.version})`,
        description: parameters.name,
        examples: thumbnails,
        releaseName: parameters.releaseName,
        releaseVersion: parameters.version,
    });
    return indexHtmlContent;
}

export async function generateExample(htmlFile, highlighter, parameters) {
    const htmlFilename = path.basename(htmlFile);
    const jsFilename = htmlFilename.replace('.html', '.js');

    const jsFile = htmlFile.replace('.html', '.js');

    const jsContent = await fse.readFile(jsFile, 'utf-8');

    const name = path.parse(htmlFile).name;
    const { attributes, body: htmlCustomContent } = parseExample(htmlFile);
    const cssContent = parseCss(htmlFile);

    const giro3dVersion =
        parameters.releaseName === 'next'
            ? 'git+https://gitlab.com/giro3d/giro3d.git' // Not packaged yet, set git repo
            : parameters.version.substring(1); // Remove "v"

    const variables = {
        content: htmlCustomContent.trim(),
        customcss: cssContent,
        example_name: attributes.title,
        name: name,
        giro3d_version: giro3dVersion,
        title: attributes.title,
        description: attributes.shortdesc,
        long_description: attributes.longdesc ?? '',
        attribution: attributes.attribution ?? '',
        js: jsFilename,
        highlightedJsCode: undefined,
        highlightedHtmlCode: undefined,
        highlightedPackageCode: undefined,
        releaseName: parameters.releaseName,
        releaseVersion: parameters.version,
        dependencies: attributes.dependencies,
    };

    if (highlighter) {
        const htmlCodeTemplate = readTemplate('published_html.ejs');

        const htmlCode = htmlCodeTemplate(variables).trim();
        const packageJson = generatePackageJsonContent(variables).trim();
        let sourceCode = jsContent
            .replaceAll(/import StatusBar from.*\n/gi, '')
            .replaceAll(/StatusBar\.bind[^;]*;/gim, '')
            .trim();

        sourceCode = inlineImports(sourceCode);

        // Cleanup superfluous line breaks caused by text removal
        sourceCode = sourceCode.replace(/\n\s*\n\s*\n/gs, '\n\n');

        variables['highlightedJsCode'] = highlighter.codeToHtml(sourceCode, { lang: 'js' });
        variables['highlightedHtmlCode'] = highlighter.codeToHtml(htmlCode, { lang: 'html' });
        variables['highlightedPackageCode'] = highlighter.codeToHtml(packageJson, {
            lang: 'json',
        });
    }

    const htmlTemplate = readTemplate(
        parameters.mode === 'production' ? 'example.ejs' : 'example-dev.ejs',
    );
    const htmlContent = htmlTemplate(variables);

    return htmlContent;
}

/**
 * @param {string} sourceCode
 * @returns {string}
 */
function inlineImports(sourceCode) {
    function inline(filename) {
        let content = fse.readFileSync(path.join(examplesDir, 'widgets', filename), 'utf-8');

        // Since it is inlined, we need to get rid of the export keyword
        content = content.replace('export function', 'function');

        // Let's remove imports, otherwise they would appear multiple
        // times or right in the middle of the source code.
        // The drawback is that the source code must provide those imports,
        // even if they appear unused.
        content = content.replace(/import .*?;/gs, '');

        content = content.trim() + '\n';

        return content;
    }

    return sourceCode.replace(/import .*? from '.\/widgets\/(\w+.js)';/g, (_, filename) =>
        inline(filename),
    );
}

/**
 * @param {string} list
 * @return {Record<string, string>} For each dependency name, the version found in the root package.json
 */
function parseDependencyList(list) {
    const result = {};

    const filename = path.join(rootDir, 'package.json');
    const projectPackageJson = JSON.parse(fse.readFileSync(filename, 'utf-8'));

    function findVersion(packageName) {
        return (
            projectPackageJson['dependencies'][packageName] ??
            projectPackageJson['peerDependencies'][packageName] ??
            projectPackageJson['devDependencies'][packageName]
        );
    }

    if (list) {
        // Dependency names might have [double] quotes to make them compatible with YAML
        // headers (the @ sign must be quoted for example), let's clean them.
        const names = list.map(chunk => chunk.trim().replace(/'/g, '').replace(/"/g, ''));

        for (const name of names) {
            result[name] = findVersion(name);
        }
    }

    return result;
}

function generatePackageJsonContent(parameters) {
    const dependencies = parseDependencyList(parameters.dependencies);

    const content = {
        name: parameters.name,
        dependencies: {
            ...dependencies,
            '@giro3d/giro3d': parameters.giro3d_version,
        },
        devDependencies: {
            vite: '^3.2.3',
        },
        scripts: {
            start: 'vite',
            build: 'vite build',
        },
    };

    const INDENT = 4;
    return JSON.stringify(content, null, INDENT);
}

export async function getWebpackConfig(parameters) {
    log('examples', 'Generating webpack configuration...');
    const entry = findExamplesEntries();

    if (!parameters.version) {
        if (parameters.releaseName === 'next') {
            parameters.version = await getGitVersion();
        } else {
            parameters.version = await getPackageVersion();
        }
    }

    if (!fse.existsSync(path.join(parameters.output, '..', '..', 'assets'))) {
        await copyAssets({
            output: path.join(parameters.output, '..', '..'),
        });
    }

    let highlighter;
    if (parameters.mode === 'production') {
        highlighter = await shiki.getHighlighter({
            theme: 'github-light',
            langs: ['js', 'html', 'json'],
        });
    }

    const webpackConfig = {
        mode: parameters.mode,
        watchOptions: {
            ignored: /node_modules/,
            poll: false,
        },
        context: examplesDir,
        resolve: {
            alias: { '@giro3d/giro3d': giro3dPackageDir },
        },
        devtool: 'source-map',
        entry,
        target: ['web', 'es5'],
        output: {
            filename: '[name].js',
            clean: true,
            path: parameters.output,
            library: '[name]',
            libraryTarget: 'umd',
            umdNamedDefine: true,
            devtoolModuleFilenameTemplate: 'webpack://[namespace]/[resource-path]?[loaders]',
            devtoolNamespace: 'giro3d',
        },
        performance: {
            maxEntrypointSize: 1024000 * 5, // 5MB
            maxAssetSize: 1024000 * 3, // 5MB
        },
        optimization: {
            minimize: parameters.mode === 'production',
            splitChunks: {
                chunks(chunk) {
                    return chunk.name !== 'index';
                },
                // TODO: better chunking
                name: 'shared',
            },
        },
        devServer: {
            hot: true,
            client: {
                progress: true,
                overlay: true,
            },
            static: [
                {
                    directory: path.join(parameters.output, '..', '..', 'assets'),
                    publicPath: '/assets/',
                },
                {
                    directory: path.join(parameters.output, '..', '..', 'images'),
                    publicPath: '/images/',
                },
            ],
        },
        plugins: [
            new CopyPlugin({
                patterns: [
                    {
                        from: 'index.js',
                        to: 'index.html',
                        transform: (content, from) => {
                            const htmlFiles = getExamplesFiles();
                            return generateIndex(htmlFiles, parameters);
                        },
                    },
                    {
                        from: '*.html',
                        to: '.',
                        transform: (content, from) =>
                            generateExample(from, highlighter, parameters),
                    },
                    { from: 'css', to: 'css' },
                    { from: 'image', to: 'image' },
                    { from: 'screenshots', to: 'screenshots' },
                    { from: 'data', to: 'data' },
                ],
            }),
        ],
    };

    logOk('examples', `Found ${Object.keys(entry).length - 1} examples`);
    return webpackConfig;
}

export async function cleanExamples(parameters) {
    log('examples', 'Cleaning output directory...');
    fse.removeSync(parameters.output);
}

export async function buildExamples(parameters) {
    const webpackConfig = await getWebpackConfig(parameters);
    const compiler = webpack(webpackConfig);

    return new Promise((resolve, reject) => {
        log('examples', 'Generating examples...');
        compiler.run((err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            console.log(stats.toString({ colors: true }));

            compiler.close(closeErr => {
                if (closeErr) reject(closeErr);
                else if (stats.hasErrors()) reject(new Error('Webpack failed'));
                else {
                    logOk('examples', `Examples built at ${webpackConfig.output.path}`);
                    resolve();
                }
            });
        });
    });
}

export async function watchExamples(parameters) {
    const sourceFolder = path.join(rootDir, 'src');

    chokidar
        .watch(`${sourceFolder}/**/*.*`)
        .on('change', p => handleModification(p, sourceFolder, giro3dPackageDir));
}

export async function serveExamples(parameters) {
    await watchExamples(parameters);

    const webpackConfig = await getWebpackConfig(parameters);
    const compiler = webpack(webpackConfig);
    const server = new webpackDevServer(webpackConfig.devServer, compiler);

    log('examples', 'Starting server...');
    return server.start();
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
        .option('--mode <environment>', 'Environment', defaultParameters.mode)
        .option('-v, --version <version>', 'Version', defaultParameters.version)
        .option(
            '-r, --release-name <version>',
            'Published version (latest, next, ...)',
            defaultParameters.releaseName,
        )
        .option('-w, --watch', 'Serve and watch for modifications', false);

    program.parse();

    const { watch, clean, ...options } = program.opts();
    const pwd = process.cwd();
    options.output = path.resolve(pwd, options.output);

    if (clean) {
        await cleanExamples(options);
    }

    await copyAssets({
        output: path.join(options.output, '..'),
    });

    if (watch) {
        await serveExamples(options);
    } else {
        await buildExamples(options);
    }
}
