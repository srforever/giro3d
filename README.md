<div align="center">
  <a href="https://giro3d.org">
    <img src="graphics/giro3d_logo.svg">
  </a>
</div>

[![Latest release](https://gitlab.com/giro3d/giro3d/-/badges/release.svg)](https://gitlab.com/giro3d/giro3d/-/tags)
[![Build Status](https://gitlab.com/giro3d/giro3d/badges/master/pipeline.svg)](https://gitlab.com/giro3d/giro3d/-/pipelines)
[![Coverage](https://gitlab.com/giro3d/giro3d/badges/master/coverage.svg)](https://gitlab.com/giro3d/giro3d/badges/master/coverage.svg)

**[giro3d](https://giro3d.org)** is a versatile [Three.js](https://threejs.org/)-based framework written in Javascript/WebGL for visualizing 3D geospatial data.

## Supported data sources

giro3d is powered by **[OpenLayers](https://openlayers.org/)** for maps,
and **Three.js** for 3d assets, and can be easily extended to support more. Below is a non-exhaustive list of supported data sources.

### Maps

- [WMTS](https://www.ogc.org/standards/wmts)
- [WMS](https://www.ogc.org/standards/wms)
- [TMS](https://www.ogc.org/standards/tms)

### Elevation data

- [DEM/DTM/DSM](https://gisgeography.com/dem-dsm-dtm-differences/) through [WMTS](https://www.ogc.org/standards/wmts)

### Vector data

- [Mapbox Vector Tiles](https://docs.mapbox.com/data/tilesets/guides/vector-tiles-introduction/)
- [GeoJSON](https://geojson.org/)
- [GPS Exchange Format (GPX)](https://en.wikipedia.org/wiki/GPS_Exchange_Format)

### 3D assets

- [3D Tiles](https://github.com/CesiumGS/3d-tiles) for optimized massive 3D datasets, including point clouds
- [glTF](https://github.com/KhronosGroup/glTF) for individual models
- [Potree point clouds](https://github.com/potree/potree)

# Getting started

To install with [npm](https://www.npmjs.com/) (recommended method):

```bash
npm install --save giro3d
```

This package contains transpiled sources of giro3d (compatible with most browsers).

If you're using a module bundler (like [wepback](https://webpack.js.org/)) or plan on targeting recent enough browser, you can
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

❗ This bundle also contains the dependencies.

## From a release bundle

See our [release page](https://gitlab.com/giro3d/giro3d/-/releases).

## Tests

To run the test suite:

```bash
npm run test-unit
```

## API documentation and examples

Browse the [API Documentation](http://giro3d.org/apidoc/index.html) documentation or check the [examples](http://giro3d.org/examples/index.html).

### Folder overview

- `src/Core`: core functionality, such as the `Instance`  class, coordinates and math functions
- `src/Parser`: parsers for various file formats (3D Tiles, GPX, vector tiles)
- `src/Process`: processing functions such as algorithms to select the tiles to load/unload
- `src/Provider`: classes to access remote data
- `src/Renderer`: 3D related code (including `Three.js` extensions), and GLSL shaders
- `utils/debug`: debugging helpers, such as wireframes and outlines

## Contributors

giro3d has received contributions from people listed in [CONTRIBUTORS.md](CONTRIBUTORS.md).
If you are interested in contributing to giro3d, please read [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

giro3d is the successor of [iTowns](https://www.itowns-project.org/), an original work from [IGN](https://www.ign.fr/institut/identity-card) and [MATIS research laboratory](https://www.ensg.eu/MATIS-laboratory).
It has been funded through various research programs involving the [French National Research Agency](https://anr.fr/en/), [Cap Digital](https://www.capdigital.com/en/), [The Sorbonne University](https://www.sorbonne-universite.fr/en), [Mines ParisTech](https://mines-paristech.eu/), [CNRS](https://www.cnrs.fr/en), [IFSTTAR](https://www.ifsttar.fr/en).

giro3d is currently maintained by [Oslandia](http://www.oslandia.com).
