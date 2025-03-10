<div align="center">
  <a href="https://giro3d.org">
    <img alt="Giro3D logo" src="https://giro3d.org/images/giro3d_logo.svg" height="120">
  </a>
</div>

<div align="center">
  A versatile framework to visualize geospatial data in the browser.
</div>

<br>

<div align="center">
  <a href="https://gitlab.com/giro3d/giro3d/badges/main/pipeline.svg"><img alt="CI/CD Pipeline badge" src="https://gitlab.com/giro3d/giro3d/badges/main/pipeline.svg"></a>
  <a href="https://gitlab.com/giro3d/giro3d/badges/main/coverage.svg"><img alt="CI/CD code coverage badge" src="https://gitlab.com/giro3d/giro3d/badges/main/coverage.svg"></a>
  <a href="https://www.npmjs.com/package/@giro3d/giro3d"><img alt="NPMJS latest package badge" src="https://img.shields.io/npm/v/@giro3d/giro3d?color=blue"></a>
  <a href="https://matrix.to/#/#giro3d:matrix.org"><img alt="Giro3D matrix chatroom badge" src="https://img.shields.io/matrix/giro3d:matrix.org"></a>
</div>

<hr/>

## Supported data sources

[Giro3D](https://giro3d.org) is powered by **[OpenLayers](https://openlayers.org/)** for maps,
and **[Three.js](https://threejs.org)** for 3d assets, and can be easily extended to support more. Below is a non-exhaustive list of supported data sources.

### Maps

-   [WMTS](https://www.ogc.org/standards/wmts)
-   [WMS](https://www.ogc.org/standards/wms)
-   [TMS](https://www.ogc.org/standards/tms)

### Elevation data

-   [DEM/DTM/DSM](https://gisgeography.com/dem-dsm-dtm-differences/) through [WMTS](https://www.ogc.org/standards/wmts)

### Vector data

-   [Mapbox Vector Tiles](https://docs.mapbox.com/data/tilesets/guides/vector-tiles-introduction/)
-   [GeoJSON](https://geojson.org/)
-   [GPS Exchange Format (GPX)](https://en.wikipedia.org/wiki/GPS_Exchange_Format)

### 3D assets

-   [3D Tiles](https://github.com/CesiumGS/3d-tiles) for optimized massive 3D datasets, including point clouds
-   [glTF](https://github.com/KhronosGroup/glTF) for individual models
-   [Potree point clouds](https://github.com/potree/potree)

# Getting started

To install with [npm](https://www.npmjs.com/) (recommended method):

```bash
npm install --save @giro3d/giro3d
```

This package contains both original sources (under `src/`) and slightly processed sources (dead code elimination, inlining shader code...).

If you're using a module bundler (like [wepback](https://webpack.js.org/)) or plan on targeting recent enough browser, you can
directly import it as such:

```js
import Instance from '@giro3d/giro3d/core/Instance.js';
```

You can also import the original, untranspiled sources, by adding `src` after `@giro3d/giro3d/` :

```js
import Instance from '@giro3d/giro3d/src/core/Instance.js';
```

This will probably limit browser compatibility though, without application specific process or
loader. Also, non `.js` files (such as `.glsl` files) will need to be inlined at client application
level.

## From a release bundle

See our [release page](https://gitlab.com/giro3d/giro3d/-/releases).

## With [npm link](https://docs.npmjs.com/cli/v8/commands/npm-link)

This is handy if you need to develop on Giro3D alongside your project. You need to first prepare the
package folder and link from there:

```bash
npm run make-package
cd build/giro3d
npm link
# then in your project folder
npm link @giro3d/giro3d
```

To ease development, files can be automatically transpiled on modification with the `watch` script :

```bash
npm run watch
```

Each time a source file is modified, this script will transpile it in the build folder.

## Tests

To run the test suite:

```bash
npm test
```

## API documentation and examples

Browse the [API Documentation](http://giro3d.org/apidoc/index.html) documentation or check the [examples](http://giro3d.org/examples/index.html).

## Contributors and sponsors

Giro3D has received contributions and sponsoring from people and organizations listed in [CONTRIBUTORS.md](CONTRIBUTORS.md).
If you are interested in contributing to Giro3D, please read [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

Giro3D is the successor of [iTowns](https://www.itowns-project.org/), an original work from [IGN](https://www.ign.fr/institut/identity-card) and [MATIS research laboratory](https://www.ensg.eu/MATIS-laboratory).
It has been funded through various research programs involving the [French National Research Agency](https://anr.fr/en/), [Cap Digital](https://www.capdigital.com/en/), [The Sorbonne University](https://www.sorbonne-universite.fr/en), [Mines ParisTech](https://mines-paristech.eu/), [CNRS](https://www.cnrs.fr/en), [IFSTTAR](https://www.ifsttar.fr/en).

Giro3D is currently maintained by [Oslandia](http://www.oslandia.com).

## No code with Piero

In case you don't want to code your own application, you can also use [Piero](https://piero.giro3d.org), our sister project - also available on [GitLab](https://gitlab.com/giro3d/piero).

<div align="center">
  <a href="https://piero.giro3d.org">
    <img alt="Piero logo" src="https://piero.giro3d.org/piero_logo.svg" height="120">
  </a>
</div>

## FAQ

### Where does the name Giro3D come from ?

The name is a reference to the italian mathematician and inventor [Girolamo Cardano](https://en.wikipedia.org/wiki/Gerolamo_Cardano).
