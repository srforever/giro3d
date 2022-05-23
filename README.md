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

See our [release page](https://gitlab.com/giro3d/giro3d/-/releases).


## Supported data types and features

- Imagery from WMTS/WMS/TMS
- Elevation (DTM/DSM) from WMTS
- 3D Tiles
- ...

## Tests

If you want to run tests, please execute:

```
npm run test-unit
```

## Contributors

giro3d has received contributions from people listed in [CONTRIBUTORS.md](CONTRIBUTORS.md).
If you are interested in contributing to giro3d, please read [CONTRIBUTING.md](CONTRIBUTING.md).

giro3d has been redesigned from this [early version](https://github.com/giro3d/giro3d-legacy).

## Support

giro3d is the successor of iTowns, an original work from French IGN, MATIS research laboratory.
It has been funded through various research programs involving the French National Research Agency, Cap Digital, UPMC, Mines ParisTec, CNRS, LCPC.

giro3d is currently maintained by Oslandia ( http://www.oslandia.com )



