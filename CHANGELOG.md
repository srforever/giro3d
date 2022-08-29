# Changelog

## v0.4.0 (2022-08-29)

### BREAKING CHANGE

- `Instance.removeObject` has been renamed, please use `Instance.remove` instead.
- `3dtiles` data source should now use `Tiles3D` instead of `GeometryLayer`. Example code:
```js
import Tiles3D from '../src/entities/Tiles3D.js';
import Tiles3DSource from '../src/sources/Tiles3DSource.js';

const pointcloud = new Tiles3D(
    'pointcloud',
    new Tiles3DSource('https://3d.oslandia.com/3dtiles/eglise_saint_blaise_arles/tileset.json'),
);
```
- The protocols 'rasterizer' and 'wfs' should be remplaced by a Vector source. The
protocol 'wms' should be remplaced by a WMS source.
- Map.addLayer requires a Layer, ColorLayer or a ElevationLayer, not an
object anymore. Please see `./examples/planar.js` for instance.
- Instance.getParentLayer() has been renamed to  Instance.getOwner()

### Feat

- **Instance**: add domElement accessor
- **entities**: add the Tiles3D entity
- **Instance**: add registerCRS() static method

### Fix

- **Instance**: reject when object is not of the correct type
- **DEMUtils.js**: fix offset calculation from parent texture when picking
- **DEMUtils.js**: fix a call to THREE API (a leftover from an upgrade of THREE)
- **DEMUtils.js**: fix the logic of getting the correct tile we pick from
- **LayeredMaterial.js**: stop using arbitrary long timeout for refreshing atlas
- correctly inherit textures from parent tiles
- **examples**: use useTHREEcontrols() everywhere
- **examples**: use MapControls instead of OrbitControls to be consistent
- **TileFS.glsl**: don't compile shader loop if TEX_UNITS is not defined
- **PointCloud**: fix colorizing a pointcloud via a layer
- **cog example**: fix the layer selection in the example
- **examples**: fix searchbox ignoring upper case text
- **StaticProvider**: fix usage of StaticProvider with new source
- **Map**: provide optional object3d in constructor
- **examples**: define the __DEBUG__ variable if mode = 'development'
- **examples**: fix path to giro3d.js bundle

### Refactor

- **DEMUtils**: remove some useless function parameters
- **DEMUtils**: rename some variables named layer in entity
- **LayeredMaterial**: separate elevation and color texture get/set methods
- **Instance**: rename removeObject() -> remove()
- **examples**: remove references to loading screen
- **examples**: use clearColor option in Instance constructor
- **examples**: use Instance.registerCRS()
- **CustomTiledImageProvider**: remove magic number
- rename Static\* to CustomTiledImage
- **StaticSource**: move code from static provider to source
- **LayeredMaterial**: remove dead code
- **LayeredMaterial**: unroll the loop in the shader itself
- **examples**: use tree shaked module imports and separate JS files
- **examples**: remove json defined layers
- **examples**: move dat.gui in package devDependencies
- **tileMesh**: move findNeighbours in TileMesh class
- **map**: move updateMinMaxDistance in Map class
- **map**: move testTileSSE in Map class
- tree-shake Three.js imports
- remove ColorTextureProcessing.js and ElevationTextureProcessing.js
- create CogSource to replace 'cog' protocol when creating layer
- delete useless instance parameter
- adapt the C3DEngine class to ES6
- remove Raster, WFS and WMS protocols
- create ColorLayer and ElevationLayer
- **examples**: use export function to access CLI options

## v0.3.0 (2022-07-04)

### BREAKING

* Instance, Map: capitalize file names: you might need to change your imports if you reference
individual files


### Features 

* Add helpers method to integrate any THREE controls in giro3d
* add min/max height options on FirstPersonControls

### Fixes

* Fix picking with radius on regular THREE.js objects

### Documentation

More classes are now documented. More are even in progress!

The README has been rewritten (fix broken links, add logo, improve readability)

### others

* vscode: add tasks.json

## v0.2.0 (2022-06-16)

* Example: change the background color of orthographic.html
* Update three js to v0.135
* Fix: remove useless log
* Upgrade OpenLayers to the latest version to use the GeoTIFF loader

## v0.1.1 (2022-05-25)

* Fix: display of heightfield elevation
* Fix: fix picking on tile with heightfield elevation
* Fix: correct typo in instance.threeObjects
* Fix: also pick from THREE.Object3D we know about
* Chore: fix the repo url in package.json
* Fix: babel invocation in observer.py


## v0.1.0 (2022-05-20)

Initial release
