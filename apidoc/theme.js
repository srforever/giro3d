/* eslint-disable @typescript-eslint/no-var-requires */
const { DefaultTheme, DefaultThemeRenderContext, JSX } = require('typedoc');
const path = require('path');
const fse = require('fs-extra');
const ejs = require('ejs');

exports.load = exports.CustomTheme = exports.CustomThemeContext = exports.toolbar = void 0;

// eslint-disable-next-line no-undef
const baseDir = __dirname;
const rootDir = path.join(baseDir, '..');
const templatesDir = path.join(rootDir, 'tasks', 'templates');

// light customization of the layout to make it compatible with bootstrap.
const defaultLayout = (context, template, props) => {
    const defaultOutput = context.nativeDefaultLayout(template, props);

    const bodyElement = defaultOutput.children.find(e => e?.tag === 'body');
    if (bodyElement) {
        // Force light theme
        const scriptContainer = bodyElement.children.find(e => e?.tag === 'script');
        if (scriptContainer) {
            const themeSelectorIdx = scriptContainer.children.findIndex(e =>
                e?.props?.html?.startsWith('document.documentElement.dataset.theme'),
            );
            if (themeSelectorIdx > -1) {
                const themeSelector = scriptContainer.children[themeSelectorIdx];
                themeSelector.props.html = 'document.documentElement.dataset.theme = "light";';
            }
        }

        // Make container fluid
        const mainContainer = bodyElement.children.find(e => {
            return e?.tag === 'div' && e?.props?.class === 'container container-main';
        });
        if (mainContainer) {
            mainContainer.props.class = 'container-fluid container-main';
        }
    }
    return defaultOutput;
};

// Disable themeSelector in the right-hand side panel
const settings = context => {
    const defaultOutput = context.nativeSettings();
    const details = defaultOutput.children.at(0);
    const detailsContent = details?.children?.at(1);
    const themeSelector = detailsContent?.children?.findIndex(
        e => e.props.class === 'tsd-theme-toggle',
    );
    if (themeSelector) {
        detailsContent.children.splice(themeSelector, 1);
    }
    return defaultOutput;
};

// Use toolbars from our template
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const toolbar = (context, props) => {
    const navbarTemplate = ejs.compile(
        fse.readFileSync(path.join(templatesDir, 'navbar.ejs'), 'utf-8'),
        {
            templateFilename: 'navbar',
            root: templatesDir,
            views: [templatesDir],
        },
    );
    const html = navbarTemplate({
        activeId: 'apidoc',
        searchApidoc: true,
        dataBase: context.relativeURL('./'),
    });
    return JSX.createElement(JSX.Raw, { html });
};
exports.toolbar = toolbar;

/**
 * The theme context is where all of the partials live for rendering a theme,
 * in addition to some helper functions.
 *
 * Here we just change the toolbar (NOTE: the <header> element lives in the toolbar partial, not in
 * the header partials, which contains the *title* displayed in the content)
 */
class CustomThemeContext extends DefaultThemeRenderContext {
    constructor(theme, page, options) {
        super(theme, page, options);

        this.nativeDefaultLayout = this.defaultLayout;
        this.nativeSettings = this.settings;

        // Overridden methods must have `this` bound if they intend to use it.
        // <JSX.Raw /> may be used to inject HTML directly.
        this.toolbar = page => toolbar(this, page);
        this.defaultLayout = (template, page) => defaultLayout(this, template, page);
        this.settings = () => settings(this);
    }
}
exports.CustomThemeContext = CustomThemeContext;

/**
 * A near clone of the default theme, it just changes the context
 */
class CustomTheme extends DefaultTheme {
    getRenderContext(pageEvent) {
        return new CustomThemeContext(this, pageEvent, this.application.options);
    }
}
exports.CustomTheme = CustomTheme;

/**
 * Called by TypeDoc when loading this theme as a plugin. Should be used to define themes which
 * can be selected by the user.
 */
function load(app) {
    // hack to hide the "Giro3D" title on the root page of the apidoc
    // (we display the logo instead)
    // we still display the title on other pages because it contains the breadcrumb, and the title
    // of the class
    // The alternative is to declare a custom header in CustomThemeContext, but it involves
    // copy-pasting not only the header from the theme, but some libs, utils etc...
    app.renderer.hooks.on('body.end', () =>
        JSX.createElement(
            'script',
            null,
            JSX.createElement(JSX.Raw, {
                html: `
if (document.location.pathname === "/apidoc/" || document.location.pathname === "/" || document.location.pathname.endsWith("/apidoc/index.html") || document.location.pathname.endsWith("/apidoc/")) {
    document.querySelector(".col-content .tsd-page-title").style.display = "none";
}
`,
            }),
        ),
    );

    // Inject our own style and favicon
    app.renderer.hooks.on('head.end', () =>
        JSX.createElement(JSX.Raw, {
            html: `
<link rel="icon" href="/images/favicon.svg" />
<link rel="stylesheet" href="/assets/bootstrap-custom.css" />
        `,
        }),
    );

    // define our theme
    app.renderer.defineTheme('custom', CustomTheme);
}
exports.load = load;
