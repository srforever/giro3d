# Changelog

## v0.10.0 (2022-11-10)

### Feat

- **TextureGenerator**: replace nodata values by valid values to remove interpolation effect
- **TileGeometry**: remove nodata triangulation
- **Stiching**: use geometry dimension instead of segments to allow rectangular stiching

### Fix

- **Extent**: proper center to target
- **Inspector**: fix missing layer opacity slider when opacity is zero

### Refactor

- **Extent**: remove quadTreeSplit, replace by split(2, 2)

## v0.9.0 (2022-11-03)

### Fix

- **OLTileProvider**: skip source tiles outside the layer's extent
- **OLVector*Provider**: render the image in own canvas instead of tile atlas
- **LayerInspector**: truncate the layer names when they are too long

## v0.8.0 (2022-10-27)

This release contain mainly bugfixes related to maps and elevation layers, as well as features
regarding no-data handling in elevation layers.

### Feat

- **TextureGenerator**: consider NaN values as no-data when relevant
- **Map**: add an option to discard no-data elevation pixels in the fragment shader

### Fix

- **Map**: tile outlines are now available even in non-DEBUG builds
- **LayeredMaterial**: fix memory leak of colormap textures
- **LayeredMaterial**: fix issues where semi-transparent tile images would be drawn on top of each other
- **LayeredMaterial**: use the exact size of the elevation texture for hillshading
- **ElevationLayer**: fix missing redraw after updating the elevation texture of a tile

### Perf

- **Inspector**: update panels only if they are open
- **TileGeometry**: recycle object for dimensions computation

## v0.7.0 (2022-10-20)

This release contains a lot of features and bugfixes related to map and terrain rendering, most notably colormapping and hillshading. No breaking changes.

### Feat

- **LayeredMaterial**: hillshading and colormaps can now be toggled
- handle raw elevation values in shaders
- **Picking**: add filter options to filter results
- **Picking**: add support of filter option for all picking methods
- **Picking**: add limit options to limit the number of items to pick
- **Colormapping**: colorize elevation, slope and aspect by an color array LUT
- **Hillshading**: parametrize light directions for hillshade calculation

### Fix

- **LayeredMaterial**: fix incorrect manipulation of elevation defines
- **OLTileProvider**: handle missing tiles in the source
- **DEMUtils**: handle non-byte elevation textures
- **COGProvider**: handle 32-bit float data
- **DEMUtils**: fix reading value from textures image data
- **DEMUtils**: normalize pixel value coming from image.data and fix flipY=false
- **DEMUtils**: correct elevation from textures image data
- **Picking**: fix where filter to ensure object is supported
- **Picking**: fix mouse position when picking on multiple sources
- **LayeredMaterial.js**: remove delayed repaint of the atlas
- **examples**: fix elevation values

### Refactor

- **Picking**: started cleaning-up pickObjectsAt redefinitions
- **Picking**: passing radius&filter as options
- **lightDirection**: expose lightDirection to the Map entity
- **Hillshading**: change where the hillshade options are set and applied (better API)

### Perf

- **Picking**: avoid creating unnecessary arrays when picking

## v0.6.0 (2022-10-13)

This release contains mainly bugfixes around HTML layout and map display. No breaking changes.

### Feat

- **Instance**: warn if the supplied host div is not an Element or has children
- **Inspector**: add button to dump map tiles in the console
- **ElevationLayer**: inherit from root texture when none available
- **Inspector**: expose the .visible property of layers

### Fix

- **styling**: make sure canvas resizing works well for any layout
- **Layer**: ensure that all preprocessings are finished before setting ready = true
- **ElevationLayer**: find ancestor with a reusable texture instead of only the direct parent
- **ColorLayer,ElevationLayer**: don't update anything until the layer is ready
- **Map**: don't preprocess the layer twice
- **OLTileProvider**: don't override layer.extent
- **Map**: enforce layer ordering in an async context
- **TileFS/HillShading**: correct UV for hillshading
- **Cache**: fix clear() that was not a valid function

### Refactor

- **styling**: always create viewport in instance
- **styling**: simplify size computation
- **Instance**: better resize observer
- **ColorLayerOrdering**: remove unused class
- **CustomTiledImage**: fix dead/deprecated code

## v0.5.0 (2022-10-10)

This releases contain many bugfixes and improvements related to maps and layers, as well as the Inspector class to inspect and help debug the Giro3D instance.

### BREAKING CHANGE

- PlanarTileBuilder, PanoramaTileBuilder and PanoramaView are removed. All tiles are
now considered planar (including terrain deformation). Note: PanoramaView may be restored in a future release.
- PotreePointCloud: computeScreenSpaceError() uses point radius instead of diameter. Some adjustment may be needed in existing code to take into account the change in the resulting SSE.

### Feat

- **COGProvider/ElevationLayer**: add elevation cog processing to demonstrate nodata triangulation
- **TileGeometry**: update tile geometry with elevation data, triangulate according to nodata
- **Map**: let the map select the best tile size
- **Map**: subdivide extent into level 0 tiles to minimize distortion
- **Extent**: add the split() method
- **Instance.js**: support adding and removing threejs objects
- **Map**: expose the backgroundColor option
- **Map**: expose the segments property in the options
- **Map**: supports hillshading through options
- **GeographicCanvas**: add the getImageData() method
- **Inspector**: add custom inspector for PotreePointCloud
- add PotreePointCloud entity
- **Instance**: improve focusObject() to be more generic
- **Inspector**: add the Inspector
- **Helpers**: add Helpers class
- **Instance**: add events when an entity is added/removed
- **Map**: fire events layer-added and layer-removed

### Fix

- **Instance**: handle resizing the containing DOM element
- **TileGeometry.test**: adapt the tests to the latest changes
- **TileGeometry/ElevationLayer**: create a new geometry instead of updating buffers
- **hillshade**: fix camera orientation issue in example
- **Packer**: stop forcing the image sizes in power of two
- **examples**: fix broken URL after release of OL7
- **TileFS.glsl**: fix absence of hillshading when no color layer is present
- **TileFS.glsl**: fix reversed sampling of elevation texture
- enable wireframe and tile outlines in __DEBUG__
- **Map**: allow arbitrary EPSG:3857 extents
- **LayeredMaterial**: ensure the atlas is correctly initialized before drawing into it
- **ColorLayer**: fix undefined error if parent has no color texture
- **PotreePointCloud**: computeScreenSpaceError() uses point radius instead of diameter
- **Layer.js**: allow more openlayers sources
- **OLTileProvider**: support arbitrary number of tiles per Map tile
- **planartilebuilder**: center correctly planar map tiles when using geographic extents
- **Map**: rewrite removeLayer() to actually remove the layer

### Refactor

- **COGProvider/ColorLayer/ElevationLayer**: architecture changes for the review
- **providers**: remove unused fx property
- **Map**: remove unused property validityExtent
- **TileGeometry**: simplify, comment and accelerate TileGeometry creation
- **Prefab/**: remove Prefab/ (PlanarTileBuilder, PanoramaTileBuilder and PanoramaView)
- **OLTileProvider**: fix type signature of loadTiles()
- **Map**: remove disableSkirt property
- rename view in instance
- add names to THREE objects
- **entities/layers**: add 'type' property to help with Inspector
- **LayerUpdateStrategy**: create an object that contains all strategies
- **Layer**: rename clean() -> dispose()

### Perf

- **OLTileProvider**: further optimize the generation of tile textures
- **TileGeometry**: rewrote TileGeometry in the fashion of SmartGrid
- **COGProvider**: produce DataTextures instead of Textures
- **OLTileProvider**: produce DataTextures instead of Textures
- **LayeredMaterial**: support DataTextures

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
