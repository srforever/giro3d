import type { RenderTemplate } from 'typedoc';
import {
    Application,
    DeclarationReflection,
    DefaultTheme,
    DefaultThemeRenderContext,
    JSX,
    Options,
    PageEvent,
    ProjectReflection,
    Reflection,
} from "typedoc";


// taken from default theme
function getDisplayName(refl: Reflection): string {
    let version = "";
    if ((refl instanceof DeclarationReflection || refl instanceof ProjectReflection) && refl.packageVersion) {
        version = ` - v${refl.packageVersion}`;
    }

    return `${refl.name}${version}`;
}

// light customization of the layout to make it compatible with bootstrap.
// unfortunately, no easier way than copying the whole content of
// typedoc/src/lib/output/themes/default/layouts/default.tsx to modify it
const defaultLayout = (
    context: DefaultThemeRenderContext,
    template: RenderTemplate<PageEvent<Reflection>>,
    props: PageEvent<Reflection>,
) => (
    <html class="default" lang={context.options.getValue("htmlLang")}>
        <head>
            <meta charSet="utf-8" />
            {context.hook("head.begin")}
            <meta http-equiv="x-ua-compatible" content="IE=edge" />
            <title>
                {props.model.isProject()
                    ? getDisplayName(props.model)
                    : `${getDisplayName(props.model)} | ${getDisplayName(props.project)}`}
            </title>
            <meta name="description" content={"Documentation for " + props.project.name} />
            <meta name="viewport" content="width=device-width, initial-scale=1" />

            <link rel="icon" href="/images/favicon.svg" />
            <link rel="stylesheet" href={context.relativeURL("assets/style.css", true)} />
            <link rel="stylesheet" href={context.relativeURL("assets/highlight.css", true)} />
            {context.options.getValue("customCss") && (
                <link rel="stylesheet" href={context.relativeURL("assets/custom.css", true)} />
            )}
            <script defer src={context.relativeURL("assets/main.js", true)}></script>
            <script async src={context.relativeURL("assets/search.js", true)} id="tsd-search-script"></script>
            {context.hook("head.end")}
        </head>
        <body>
            {context.hook("body.begin")}
            <script defer>
                <JSX.Raw html={`
                    document.documentElement.dataset.theme = "light";
                    localStorage.setItem("tsd-theme", "light");
                `}/>
            </script>
            {context.toolbar(props)}

            <div class="container-fluid container-main">
                <div class="col-content">
                    {context.hook("content.begin")}
                    {context.header(props)}
                    {template(props)}
                    {context.hook("content.end")}
                </div>
                <div class="col-sidebar">
                    <div class="page-menu">
                        {context.hook("pageSidebar.begin")}
                        {context.pageSidebar(props)}
                        {context.hook("pageSidebar.end")}
                    </div>
                    <div class="site-menu">
                        {context.hook("sidebar.begin")}
                        {context.sidebar(props)}
                        {context.hook("sidebar.end")}
                    </div>
                </div>
            </div>

            {context.footer()}

            <div class="overlay"></div>

            {context.analytics()}
            {context.hook("body.end")}
        </body>
    </html>
);

// bootstrap toolbars, instead of the default theme toolbar
export const toolbar = (context: DefaultThemeRenderContext, props: PageEvent<Reflection>) => (
    <header class="header">
        <div class="container-fluid">
            <a href="#" class="navbar-brand mx-0">
                <img src="/images/favicon.svg" class="brand" width={32} height={32} />
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>

            <div class="collapse navbar-collapse" id="navbarSupportedContent">
                <ul class="navbar-nav navbar-nav-left">
                    <li class="nav-item">
                        <a class="nav-link" href="/index.html">Home</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link nav-link-primary" href="/giro3d.html">Giro3D framework</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link nav-link-success" href="/piero.html">Piero application</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link nav-link-primary" href="/tutorials/getting-started.html">Getting started with Giro3D</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link nav-link-primary" href="/examples/index.html">Giro3D examples</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link nav-link-primary active" aria-current="page" href="/apidoc/index.html">API documentation</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link nav-link-primary" href="/governance.html">Governance</a>
                    </li>
                </ul>
                <ul class="navbar-nav">
                    <li class="nav-item">
                        <a
                            class="nav-link"
                            href="https://gitlab.com/giro3d/giro3D"
                            target="_blank"
                            >GitLab <i class="bi bi-box-arrow-up-right"></i
                        ></a>
                    </li>
                </ul>
                <form class="form-inline" id="tsd-search" role="search" data-base={context.relativeURL("./")}>
                    <input name="q" type="text" id="tsd-search-field" aria-label="Search" class="form-control search-query" placeholder="Search" autocomplete="off" autofocus={true}/>
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
    constructor(theme: DefaultTheme, page: PageEvent<Reflection>, options: Options) {
        super(theme, page, options);

        // Overridden methods must have `this` bound if they intend to use it.
        // <JSX.Raw /> may be used to inject HTML directly.
        this.toolbar = page => toolbar(this, page);
        this.defaultLayout = (template, page) => defaultLayout(this, template, page);
    }
}

/**
 * A near clone of the default theme, it just changes the context
 */
export class CustomTheme extends DefaultTheme {
  private _contextCache?: CustomThemeContext;

  override getRenderContext(pageEvent: PageEvent<Reflection>): CustomThemeContext {
    this._contextCache ||= new CustomThemeContext(
      this,
      pageEvent,
      this.application.options
    );
    return this._contextCache;
  }
}
/**
 * Called by TypeDoc when loading this theme as a plugin. Should be used to define themes which
 * can be selected by the user.
 */
export function load(app: Application) {
    // we need bootstrap
    app.renderer.hooks.on("head.end", () => (
        <link href="/assets/bootstrap-custom.css" rel="stylesheet" />
    ));
    // hack to hide the "Giro3D" title on the root page of the apidoc
    // (we display the logo instead)
    // we still display the title on other pages because it contains the breadcrumb, and the title
    // of the class
    // The alternative is to declare a custom header in CustomThemeContext, but it involves
    // copy-pasting not only the header from the theme, but some libs, utils etc...
    app.renderer.hooks.on("body.end", () => (
        <script>
            <JSX.Raw html={
                `if (document.location.pathname == "/apidoc/index.html") {
                    document.querySelector(".col-content .tsd-page-title").style.display = "none";
                }
            `}/>
        </script>
    ));

    // define our theme
    app.renderer.defineTheme("custom", CustomTheme);
}
