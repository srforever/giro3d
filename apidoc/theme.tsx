import type { RenderTemplate } from 'typedoc';
import {
    Application,
    DefaultTheme,
    DefaultThemeRenderContext,
    JSX,
    Options,
    PageEvent,
    Reflection,
} from 'typedoc';

type JSXHtmlElement = JSX.Element & {
    props?: {
        html?: string;
        class?: string;
    };
};

// light customization of the layout to make it compatible with bootstrap.
// unfortunately, no easier way than copying the whole content of
// typedoc/src/lib/output/themes/default/layouts/default.tsx to modify it
const defaultLayout = (
    // eslint-disable-next-line no-use-before-define
    context: CustomThemeContext,
    template: RenderTemplate<PageEvent<Reflection>>,
    props: PageEvent<Reflection>,
) => {
    const defaultOutput = context.nativeDefaultLayout(template, props);

    const bodyElement = defaultOutput.children.find((e: JSX.Element) => e?.tag === 'body') as
        | JSX.Element
        | undefined;
    if (bodyElement) {
        // Force light theme
        const scriptContainer = bodyElement.children.find(
            (e: JSX.Element) => e?.tag === 'script',
        ) as JSX.Element | undefined;
        if (scriptContainer) {
            const themeSelectorIdx = scriptContainer.children.findIndex((e: JSXHtmlElement) =>
                e?.props?.html?.startsWith('document.documentElement.dataset.theme'),
            );
            if (themeSelectorIdx > -1) {
                const themeSelector = scriptContainer.children[themeSelectorIdx] as JSXHtmlElement;
                themeSelector.props.html = 'document.documentElement.dataset.theme = "light";';
            }
        }

        // Make container fluid
        const mainContainer = bodyElement.children.find((e: JSXHtmlElement) => {
            return e?.tag === 'div' && e?.props?.class === 'container container-main';
        }) as JSXHtmlElement | undefined;
        if (mainContainer) {
            mainContainer.props.class = 'container-fluid container-main';
        }
    }
    return defaultOutput;
};

// eslint-disable-next-line no-use-before-define
const settings = (context: CustomThemeContext) => {
    const defaultOutput = context.nativeSettings();
    const details = defaultOutput.children.at(0) as JSX.Element | undefined;
    const detailsContent = details?.children?.at(1) as JSX.Element | undefined;
    const themeSelector = detailsContent?.children?.findIndex(
        (e: JSXHtmlElement) => e.props.class === 'tsd-theme-toggle',
    );
    if (themeSelector) {
        detailsContent.children.splice(themeSelector, 1);
    }
    return defaultOutput;
};

// bootstrap toolbars, instead of the default theme toolbar
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const toolbar = (context: DefaultThemeRenderContext, props: PageEvent<Reflection>) => (
    <header class="header">
        <div class="container-fluid">
            <a href="#" class="navbar-brand mx-0">
                <img src="/images/favicon.svg" class="brand" width={32} height={32} />
            </a>
            <button
                class="navbar-toggler"
                type="button"
                data-bs-toggle="collapse"
                data-bs-target="#navbarSupportedContent"
                aria-controls="navbarSupportedContent"
                aria-expanded="false"
                aria-label="Toggle navigation"
            >
                <span class="navbar-toggler-icon"></span>
            </button>

            <div class="collapse navbar-collapse" id="navbarSupportedContent">
                <ul class="navbar-nav navbar-nav-left">
                    <li class="nav-item">
                        <a class="nav-link" href="/index.html">
                            Home
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link nav-link-primary" href="/giro3d.html">
                            Giro3D framework
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link nav-link-success" href="/piero.html">
                            Piero application
                        </a>
                    </li>
                    <li class="nav-item">
                        <a
                            class="nav-link nav-link-primary"
                            href={context.relativeURL('../tutorials/getting-started.html', true)}
                        >
                            Getting started with Giro3D
                        </a>
                    </li>
                    <li class="nav-item">
                        <a
                            class="nav-link nav-link-primary"
                            href={context.relativeURL('../examples/index.html', true)}
                        >
                            Giro3D examples
                        </a>
                    </li>
                    <li class="nav-item">
                        <a
                            class="nav-link nav-link-primary active"
                            aria-current="page"
                            href={context.relativeURL('../apidoc/index.html', true)}
                        >
                            API documentation
                        </a>
                    </li>
                    {/* <li class="nav-item">
                        <a class="nav-link nav-link-primary" href="/roadmap.html">
                            Roadmap
                        </a>
                    </li> */}
                    <li class="nav-item">
                        <a class="nav-link nav-link-primary" href="/faq.html">
                            FAQ
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link nav-link-primary" href="/governance.html">
                            Governance
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link nav-link-primary" href="/sponsors.html">
                            Sponsors
                        </a>
                    </li>
                </ul>
                <ul class="navbar-nav">
                    <li class="nav-item">
                        <a class="nav-link" href="https://gitlab.com/giro3d/giro3D" target="_blank">
                            GitLab <i class="bi bi-box-arrow-up-right"></i>
                        </a>
                    </li>
                </ul>
                <form
                    class="form-inline"
                    id="tsd-search"
                    role="search"
                    data-base={context.relativeURL('./')}
                >
                    <input
                        name="q"
                        type="text"
                        id="tsd-search-field"
                        aria-label="Search"
                        class="form-control search-query"
                        placeholder="Search"
                        autocomplete="off"
                        autofocus={true}
                    />
                    <div class="results"></div>
                </form>
            </div>
        </div>
    </header>
);

/**
 * The theme context is where all of the partials live for rendering a theme,
 * in addition to some helper functions.
 *
 * Here we just change the toolbar (NOTE: the <header> element lives in the toolbar partial, not in
 * the header partials, which contains the *title* displayed in the content)
 */
export class CustomThemeContext extends DefaultThemeRenderContext {
    nativeDefaultLayout: (
        template: RenderTemplate<PageEvent<Reflection>>,
        props: PageEvent<Reflection>,
    ) => JSX.Element;
    nativeSettings: () => JSX.Element;

    constructor(theme: DefaultTheme, page: PageEvent<Reflection>, options: Options) {
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

/**
 * A near clone of the default theme, it just changes the context
 */
export class CustomTheme extends DefaultTheme {
    getRenderContext(pageEvent: PageEvent<Reflection>): CustomThemeContext {
        return new CustomThemeContext(this, pageEvent, this.application.options);
    }
}
/**
 * Called by TypeDoc when loading this theme as a plugin. Should be used to define themes which
 * can be selected by the user.
 */
export function load(app: Application) {
    // hack to hide the "Giro3D" title on the root page of the apidoc
    // (we display the logo instead)
    // we still display the title on other pages because it contains the breadcrumb, and the title
    // of the class
    // The alternative is to declare a custom header in CustomThemeContext, but it involves
    // copy-pasting not only the header from the theme, but some libs, utils etc...
    app.renderer.hooks.on('body.end', () => (
        <script>
            <JSX.Raw
                html={`if (document.location.pathname.endsWith("/apidoc/index.html") || document.location.pathname.endsWith("/apidoc/")) {
                    document.querySelector(".col-content .tsd-page-title").style.display = "none";
                }
            `}
            />
        </script>
    ));

    app.renderer.hooks.on('head.end', () => (
        <>
            <link rel="icon" href="/images/favicon.svg" />
            <link rel="stylesheet" href="/assets/bootstrap-custom.css" />
        </>
    ));

    // define our theme
    app.renderer.defineTheme('custom', CustomTheme);
}
