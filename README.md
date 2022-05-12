[![Gitter](https://badges.gitter.im/_giro3d/community.svg)](https://gitter.im/_giro3d/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

## Geospatial 3D WebGL visualization plateform

Giro3d is a versatile [Three.js](https://threejs.org/)-based framework written in Javascript/WebGL for visualizing 3D geospatial data.

## API documentation and examples

**[API Documentation](http://giro3d.org/apidoc/index.html)**

**[Examples](http://giro3d.org/examples/index.html)


<p align="center">
<a href="http://www.giro3d-project.org/giro3d/examples/index.html"><img src="http://www.giro3d-project.org/images/montage.jpg" /></a>
</p>

## How to use giro3d in your project

You can use it through npm (the preferred way) or download a bundle from our github release page.

### With NPM

In your project:

```bash
npm install --save giro3d
```
This package contains transpiled sources of giro3d (compatible with most browsers).

If you're using a module bundler (like wepback) or plan on targeting recent enough browser, you can
directly import it as such:

```js
import Instance from '@giro3d/giro3d/lib/Core/instance.js';
// it's also possible to do this, but this will import everything.
import * as giro3d from '@giro3d/giro3d';
```

Alternatively, we provide a bundle you can directly include in your html files that exposes `giro3d` in  `window`:
```html
<script src="node_modules/giro3d/dist/giro3d.js"></script>
```

**/!\ Please note that this bundle also contains the dependencies**.

### From a release bundle

See our [release page](https://github.com/giro3d/giro3d/releases).


## Supported data types and features

- Imagery from WMTS/WMS/TMS
- Elevation (DTM/DSM) from WMTS
- 3D Tiles
- ...

See the [feature list wiki page](https://github.com/giro3d/giro3d/wiki/Supported-Features) for a complet list of features and data formats.

## Tests

If you want to run tests you'll need to install [puppeteer](https://github.com/GoogleChrome/puppeteer).

If you install pupperter behind proxy, use HTTP_PROXY, HTTPS_PROXY, NO_PROXY to defines HTTP proxy settings that are used to download and run Chromium.

If puppeteer fails to download Chrome, you can try with the [documented environment variables](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#environment-variables).
Or you can download it manually, and then:
- install puppeteer without downloading Chrome: `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 npm install puppeteer`
- then use the env var `CHROME` to tell giro3d/mocha/puppeteer what Chrome app it should use:
`CHROME=/opt/google/chrome-beta/chrome npm run test-examples`

Then you can run the tests:
```bash
npm run test-examples
```
Supported environment variables:

    * SCREENSHOT_FOLDER: take a screenshot at the end of each test and save it in this folder. Example: SCREENSHOT_FOLDER=/tmp/
    * CHROME: path to Chrome executable. If unspecified giro3d will use the one downloaded during puppeteer install.
    * DEBUG: run Chrome in a window with the debug tools open.
    * REMOTE_DEBUGGING: run Chrome in headless mode and set up remote debugging. Example: REMOTE_DEBUGGING=9222 will setup remote debugging on port 9222. Then start another Chrome instance, browse to chrome://inspect/#devices and add localhost:9222 in Discover network targets.

Note: Chrome in headless mode doesn't support the WebGL EXT_frag_depth extension. So rendering may differ and some bugs can only be present in headless mode.

## Licence

giro3d is dual-licenced under Cecill-B V1.0 and MIT.
Incorporated libraries are published under their original licences.

See [LICENSE.md](LICENSE.md) for more information.

## Contributors

giro3d has received contributions from people listed in [CONTRIBUTORS.md](CONTRIBUTORS.md).
If you are interested in contributing to giro3d, please read [CONTRIBUTING.md](CONTRIBUTING.md).

giro3d has been redesigned from this [early version](https://github.com/giro3d/giro3d-legacy).

## Support

giro3d is an original work from French IGN, MATIS research laboratory.
It has been funded through various research programs involving the French National Research Agency, Cap Digital, UPMC, Mines ParisTec, CNRS, LCPC.

giro3d is currently maintained by Oslandia ( http://www.oslandia.com )



