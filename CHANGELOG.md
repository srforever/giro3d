
v0.3.0 / 2022-07-04
===================

## BREAKING

* Instance, Map: capitalize file names: you might need to change your imports if you reference
individual files


## Features 

* Add helpers method to integrate any THREE controls in giro3d
* add min/max height options on FirstPersonControls

## Fixes

  * Fix picking with radius on regular THREE.js objects

## Documentation

More classes are now documented. More are even in progress!

The README has been rewritten (fix broken links, add logo, improve readability)

## others

* vscode: add tasks.json

v0.2.0 / 2022-06-15
===================

  * Example: change the background color of orthographic.html
  * Update three js to v0.135
  * Fix: remove useless log
  * Upgrade OpenLayers to the latest version to use the GeoTIFF loader

v0.1.1 / 2022-05-25
==================

  * Fix: display of heightfield elevation
  * Fix: fix picking on tile with heightfield elevation
  * Fix: correct typo in instance.threeObjects
  * Fix: also pick from THREE.Object3D we know about
  * Chore: fix the repo url in package.json
  * Fix: babel invocation in observer.py

## v0.4.0 (2022-08-29)

### BREAKING CHANGE

- removeObject() no longer exists.
- this entity should replace the use of Entity3D with the '3d-tiles' protocol.
#9
- The protocols 'rasterizer' and 'wfs' should be remplaced by a Vector source. The
protocol 'wms' should be remplaced by a WMS soource.
- Map.addLayer requires a Layer, ColorLayer or a ElevationLayer, not anymore an
object
- Instance.getParentLayer() -> Instance.getOwner()

### Feat

- **Instance**: add domElement accessor
- **entities**: add the Tiles3D entity
- **Instance**: add registerCRS() static method
- **examples**: add widget to select pointcloud coloring mode
- **Instance**: reject when object is not of the correct type
- **examples**: add a search box

### Fix

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
- rename Static* to CustomTiledImage
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

## v0.2.0 (2022-06-16)

## v0.1.1 (2022-05-25)

## v0.1.0 (2022-05-20)

## v0.0.2-osl (2020-02-18)

### BREAKING CHANGE

- change view.notifyChange signature and semantics
- Before this change, `view.addLayer` was throwing some errors directly in
some cases, and rejecting the promise in others. This replaces the
former for the latter in all cases. If you relied on a try/catch block
surrounding `view.addLayer` to catch some undocumented errors, you need
to move your error handling code to your promise rejection handler.
- this modify the signature of all picking functions.
- the signature of Fetcher.texture has changed, and only
return a promise now, instead of an object containing the texture and
the promise.
- a Provider needs to return a Promise every time after
calling its executeCommand function.
- feature collection are not merged anymore
BREAKING CHANGE: GeoJSON2Feature now returns a Promise
- c3DEngine.renderViewTobuffer has been renamed renderViewToBuffer
and has a new signature.
- KML_Provider and BuildingBox_Provider have been
removed, as well as getPointOrder from WFS_Provider.

### Feat

- allow to give an array of extents to createPlanarView
- extract quadtreeSplit from TiledNodeProcessing
- **Provider**: add an OLVectorTile provider
- **core**: reduce command latency when possible
- **core**: compute camera near/far automatically
- **core**: allow scheduler to resolve command if cached
- **core**: add a Points class
- **pointclouds**: make point picking independant of the source type
- **renderer**: add default background color to texture
- **core**: add vector tile loading in TMS
- **core**: allow layer to specify which elements should be updatable
- **pointclouds**: compute extent for pointclouds elements (#793)
- **pointclouds**: compute extent for pointclouds elements

In order to be able to unify processing for elements of heterogeneous
sources we must have some shared properties.
layer.extent and element.extent is one of these, and will allow to
build colorization for pointcloud.
- **core**: add a Cache system with expiration policy
- **parser**: add partial z support for geojson parsing
- **core**: implement layer priorities
- **core**: store Layer instead of layer's id
- **core**: add a 'radius' parameter to picking methods
- **controls**: make event listeners opt-out for FirstPersonControls
- **pointcloud**: use 'changeSource' mechanism to avoid useless work
- **protocols**: make targetLevel supported for WMTS_Provider color textures
- **examples**: add a loading screen for examples
- **core**: add a new VIEW.LAYERS_INITIALIZED event
- **core**: move url function outside providers
- **protocols**: implement targetLevel for StaticProvider
- **protocols**: add spatial hashing to StaticProvider (#675)
- **panorama**: add projection type constant #677
- **core**: re-enable three.js object sorting
- **core**: add event to coordinates helpers
- **core**: compute TMS coordinates from top to bottom
- **core**: update to THREE v89
- **core**: add bounding sphere helper in debug mode
- **examples**: add gui debug in planar in debug mode only
- **3dtiles**: add wireframe support for 3dTiles layer, and add wireframe checkbox to 3dTilesDebugUI, visible in the 3dTiles example
- **wfs**: Add a debug UI for geometry layer, to change visibility, opacity and toggle wireframe, material size and material linewith
- **examples**: add point features representing route points, in the WFS examples
- **wfs**: add a function to filter feature
- **examples**: add polygon extrusion on globe example
- **wfs**: add convert and onMeshCreated customisation for wfs layers.
- **core**: add the ability to colorize pointclouds
- **controls**: support touch interface in FirstPersonControls
- Add LayerUpdateState object to manager updates cycle
- Throw custom error when cancelling commands
- Add animation option in api functions
- Add damping in globe's control, in state MOVE_GLOBE and ORBIT Add dblClick feature : move camera to click point Best behavior in mouse's move when cursor is outside the globe
- Add animation feature

### Fix

- make points selection works more reliably
- prioritize elevation text down using size
- compute min/max for elevation texture
- make sure StaticProvider works when texture grid isnt aligned with geom grid
- simplify texture inheritance
- make sure tile subdivision doens't go crazy
- **core**: make sure scheduler resumes executing commands after flush
- pointcloud shader
- honor opacity in TileFS
- **pointcloud**: use correct name for fetch options
- **provider**: use networkOptions when fetching static metadata
- log texture download errors
- elevation calculation
- use validty extent to keep the meshes aligned
- initial camera position
- center planar tile geometry
- geometry caching
- make stitching work on un-even tile scheme
- improve 3dtiles support
- **core**: avoid fiddling with prio queue internal state
- **parser**: problem filtering in geoJsonParser
- **parser**: change the internal structure of geojson
- **parser**: failing to determine the min and max elevation doesn't mean that it is zero
- **Protocol**: in TMS/VectorTile, wrong projection convert for globe
- **protocol**: wrong projection from tileMatrixSet
- **3dtiles**: stop adding the same tile multiple times
- **core**: implement preSSE once and fix the formula
- **protocols**: wrong xbil/DEM texture's min and max
- **chore**: fix package_lock.json
- **core**: compute globe fog distance after camera update
- **examples**: add missing param to notifyChange call in multiglobe
- **3dtiles**: simplify 3dtiles layer creation
- **debug**: use layer instead of layer.id in TileVisibilityChart
- **badge**: fix typo for coverage badge
- stop using 'level' property where it's not mandatory
- **security**: update to mocha v4
- **security**: update packages lock to fix security issues
- **security**: update eslint-plugin-import
- **3dtiles**: apply matrixWorld to boundingVolume.box
- **3dtiles**: dont stop subdivision at tileset boundaries
- **core**: stop to add layer if there's a error
- **core**: force the use of decimal notation in protocol requests
- **gis**: initialize Extent from Coordinates correctly
- **pointcloud**: layer.visible fixed and PointsMaterial.copy renamed to update
- **core**: make sure PlanarControls call notifyChange when needed
- **core**: assign the correct layer property
- **debug**: apply notifyChange breaking change on debug Tools
- **core**: remove correctly event listener after globe is initialized
- **Core**: reject the promise in all error cases in `view.addLayer`
- **chore**: tag eslint config as root
- **core**: make sure VIEW_EVENTS.LAYERS_INITIALIZED if fired
- **core**: delay FrameRequesters deletion to avoid breaking updates
- **debug**: cleanup pointcloud debug tools
- **pointcloud**: remove unused variable
- **core**: unassign layer of deleted objects
- **core**: correct typo in event's name
- **3dtiles**: fix pnts loading
- **examples**: unhide dat.gui elements when loadingscreen is finished (#718)
- **core**: simplify zoom, row and col in Extent
- **examples**: fix renderer.domElement's mouseEvent doesn't work under menu (#712)
- **examples**: fix Layer Visibility example
- **examples**: use correct type for updateStrategy.type
- **protocols**: handle 'w' component in WMTS_WGS84Parent
- **Coordinates**: Concerning coordinate conversions, this commit fixes two bugs:
- **panorama**: change flatbush version and import line (#689)
- correct some console outputs (#684)
- **panorama**: improve default settings for Panorama
- **core**: assume min level is 0 if not provided for dichotomy strategy
- **provider**: deal with network errors in a better way for WFS
- **provider**: don't restrict outputFormat to mimetype on WFS layers
- **protocols**: fix wrong orientation in panorama
- **core**: fix wrong 3dtiles's OBB using BuilderEllipsoidTile
- **core**: fix wrong cachekey value equal to NaN in geometry building
- **core**: stop using wmtsc for OSM layers on globe
- **core**: use parent extent transformation to compute tile's transformation
- **controls**: stop using originalTarget which mozilla-specific
- **controls**: Fix typo in getBoundingClientRect
- **examples**: fix eslint warnings
- **core**: handle near pos. in box3 visibility functions
- **core**: fix wrong calculation of the color of the sky
- **examples**: make examples test friendly
- **core**: disable logdepthbuffer if EXT_frag_depth is missing
- **examples**: bad orthographic origin
- **core**: wrong building 3dTiles's OBB
- **protocols**: wrong OBB for 3dTile's region
- **3dtiles**: SSE computation for spherical bounding volumes
- **3dtiles**: fix the sphere bounding volume visualisation in debug mode
- **GlobeControls**: minor debug
- **protocols**: avoid to set points's count at zero
- **core**: error to update OBBHelper
- **examples**: wrong tile matrix limit
- **gis**: possibility to set tiled crs
- **gis**: update proj4 to 2.4.4
- **test**: !change subdivision count in PLANAR test!
- **protocols**: wfs, adapt the mesh transformation with the tile space
- **core**: Prevent to subdivide for poor elevation level
- **protocols**: determine the correct mimeType when using StaticProvider
- **core**: blending with premultiplied color to transparent color layer
- **core**: marked dependency is insecure version
- **wfs**: use bigger integer data type for indices array, for THREE.LineSegments. Prior to this change, there was a bug, visible in the wfs globe example : if you we set buses line WFS layer Level to 10 or less, you will see bugged lines. The bug comes from the big size of the created LineSegments indices array.
- **protocols**: stop parsing unnecessarily xbil buffer
- **pointcloud**: don't ignore layer.opacity
- **pointcloud**: add internal groups before first update
- **pointcloud**: honour object3D for pointcloud layers
- **loader**: remove two warnings Prior to this change, we can see these warnings WARNING in ./src/Renderer/ThreeExtended/B3dmLoader.js 12:26-42 "export 'GLTFLoader' (imported as 'THREE') was not found in 'three' WARNING in ./src/Renderer/ThreeExtended/GLTFLoader.js 18:0-16 "export 'GLTFLoader' (imported as 'THREE') was not found in 'three'
- use babel-polyfill and url-polyfill to support IE11
- **core**: Don't try to add scene to itself
- **packaging**: put proj4 into peerDependencies and devDependencies
- **packaging**: correctly remove debug code from transpiled sources
- **core**: avoid hiding all other Object3D when hiding first layer
- restore PM layers texture display
- **controls**: use a more explicit heuristic for rotations
- **controls**: make rotation direction coherent
- **controls**: simplify internal state in FirstPersonControls
- make sure camera's matrix is only update by iTowns
- fix a bug with the points, they don't have the z-buffer logarithmic active
- remove non working Clouds feature
- add missing 'new' to Extent.clone() method
- The UI of 3dtiles example
- repair globe horizon culling when globe is not at 0,0,0
- call initNode function on level 0 nodes too
- use CDN for OrbitControls for cubic_planar example
- replace broken OPENSM example layers url
- do not remove id from user layer object
- make sure addLayer functions have a consistent API
- frame requester removal
- don't enable debug features in non debug builds
- throw an Error when adding a Layer with the same id
- properly hide 3d-tiles tiles with "replace" refinement behaviour when children are displayed
- missing 4 component value of unpack1K factors
- various syntax and grammar corrections
- don't block subdivision on frozen layers
- syntax error in 3d-tiles example
- make getXBilTextureByUrl always return a Texture
- skirt size now depends on tile size
- check if extensions field exists for b3dm rtc
- verify viewerDiv validity in View constructor
- 3dTilesProcessing outdated notifyChange call
- clarify PM coordonites computation and add limit
- 3d-tiles tiles are now properly hidden when zooming out when using the additive refinement property
- correct network options for OSM examples
- damping effect when we want camera fixed after movement
- patch log depth buffer support for imported b3dm models
- recursively cleanup all nodes
- ovezealous b3dm semantic filtering
- update 3d-tiles handling to threejs 0.86
- Check elevation values before replacing parent : LayeredMaterialNodeProcessing
- Support for bounding volume:
- Compress the code of camera
- Fix bug : The function isVisible for the sphere
- Change the calcul for radtoDeg with mathExtend
- stop resetting needsRedraw flag in multiple place in MainLoop
- restore 'request different level than tile's level' feature
- don't rebuild WMS layer extent when it's already an Extent instance
- typos
- really support external renderer
- remove Debug dependency from View
- layer properties
- use scissor test
- SimpleFS and SimpleVS no longer have obsolete header
- disable horizon culling for level-1 tiles
- Fix LayeredMaterial.setSequence method
- add tolerance when comparing Extent
- cancel subdivision commands if parent is deleted
- don't try to compute min/max elevation if no bufffer
- globe Z axis now goes through north pole and uses proper WGS84 coordinates. Set Three default up axis as z.
- make sure tile's children inherit correct layer settings
- only update debug charts if they're visible
- fix transparent layer rendering in FF
- disable double-click in GlobeControls when !enabled
- prevent auto matrix update
- use getSize() instead of size()
- correct WMS bbox computation from parent
- increase priority of non-loaded base nodes
- correct typo in function name

### Refactor

- **core**: rework texture update process
- **3dtiles**: improve 3dtiles tiles cleanup mechanism
- **test**: robustify test-example target
- change the geojson parsing of multi-
- **parser**: move Materials from potree parsers to potree provider + new layer.material option
- **core**: change view.notifyChange semantics
- **renderer**: PointsMaterial shader cleanup and optimization
- **examples**: make most examples single file
- **pointcloud**: simplify SSE computation for pointcloud
- **pointcloud**: rework point budget implementation
- **pointcloud**: simplify SSE computation for pointcloud
- **pointcloud**: rework point budget implementation
- change the return value of Fetcher.texture
- **core**: remove unused condition in Scheduler
- **core**: move commonAncestorLookup to TileMesh
- **examples**: clean up examples
- **gis**: remove _internalUnitStorage from Coordinates/Extent (#693)
- **parsers**: homogenize parser interface
- **parsers**: move and rename parsers to a new parser directory
- **vector**: add hole support
- **core**: improve render view to buffer / target functions
- **core**: unify mesh picking methods
- **core**: Homogenize all providers as static
- **core**: use common geometry in meshTile
- **wfs**: add contour coordinates to the callback that compute altitude.
- **examples**: update wfs planar to use layer.{convert, onMeshCreated}
- **example**: change controls in wfs planar example
- add Extent.intersect method and use three.js wording
- rework Tiles removal and cleanup
- rework Debug tools
- 3d-tiles/b3dm move the glTF axis rotation management in the b3dmloader.
- remove custom point/line mesh and materials
- remove BasicMaterial
- remove deprecated RTC feature
- subdivision test for planar mode rework
- Move Three' scene to View
- rename BoundingBox -> Extent
- remove WMTS dependencies in Layer update code
- remove Scene and reorganize files
- move globe specific code to ApiGlobe
- deep rework of layers and threejs integration
- move camera and controls to Scene
- rework GeoCoordinate and rename it Coordinates
- Camera now has a viewMatrix attribute. Slightly reworked camera update
- Moved geometry building from TileMesh to TileProvider
- Removed distance and helper attributes from TileMesh
- rename ThreeExtented -> ThreeExtended and MathExtented -> MathExtended
- rename ManagerCommands -> Scheduler
- simplify command system
- remove usage of defaultValue
- limit WMTS and matrixSet to WMTS_Provider
- remove dead code in TileProvider
- remove unused Node's properties
- remove Quad.js
- Elevation textures can now have 3 states
- Use new LayerUpdateState
- Stop catching errors in WMS/WTMS providers
- Invoke command.resolve/reject in ManagerCommand
- getRTCMatrixFromCenter c3DEngine fix error picking Clean up code

### Perf

- **renderer**: stop creating new vector for each feature (#713)
- **protocols**: decrease the count of network fetch image/xbil
- **examples**: increase performance in filtering the duplicates lines
- **examples**: increase performance to compute altitude line
- **protocols**: increase performance to building features
- **core**: reduce to obb's highest points for horizon culling
- **geometry**: avoid useless computation for elevation layers
- **wfs**: Avoid creating needlessly objects
