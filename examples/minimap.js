import { Vector3, CubeTextureLoader, Color, OrthographicCamera } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import OSM from 'ol/source/OSM.js';

import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import WmtsSource from '@giro3d/giro3d/sources/WmtsSource.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import BilFormat from '@giro3d/giro3d/formats/BilFormat.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';

import StatusBar from './widgets/StatusBar.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS(
    'EPSG:2154',
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
);
Instance.registerCRS(
    'IGNF:WGS84G',
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]',
);

const SKY_COLOR = new Color(0xf1e9c6);
const viewerDiv = document.getElementById('viewerDiv');
const mainInstance = new Instance(viewerDiv, {
    crs: 'EPSG:2154',
    renderer: { clearColor: SKY_COLOR },
});

// create a map
const extent = new Extent('EPSG:2154', -111629.52, 1275028.84, 5976033.79, 7230161.64);
const map = new Map('planar', {
    extent,
    backgroundColor: 'gray',
    hillshading: {
        enabled: true,
        elevationLayersOnly: true,
    },
    discardNoData: true,
    doubleSided: false,
});
mainInstance.add(map);

const noDataValue = -1000;

const capabilitiesUrl =
    'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities';

WmtsSource.fromCapabilities(capabilitiesUrl, {
    layer: 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES',
    format: new BilFormat(),
    noDataValue,
})
    .then(elevationWmts => {
        map.addLayer(
            new ElevationLayer({
                name: 'wmts_elevation',
                extent: map.extent,
                // We don't need the full resolution of terrain because we are not using any shading
                resolutionFactor: 0.25,
                minmax: { min: 0, max: 5000 },
                noDataOptions: {
                    replaceNoData: false,
                },
                source: elevationWmts,
            }),
        );
    })
    .catch(console.error);

WmtsSource.fromCapabilities(capabilitiesUrl, {
    layer: 'HR.ORTHOIMAGERY.ORTHOPHOTOS',
})
    .then(orthophotoWmts => {
        map.addLayer(
            new ColorLayer({
                name: 'wmts_orthophotos',
                extent: map.extent,
                source: orthophotoWmts,
            }),
        );
    })
    .catch(console.error);

// place camera above grenoble
mainInstance.camera.camera3D.position.set(913349.2364044407, 6456426.459171033, 1706.0108044011636);
// and look at the Bastille
const lookAt = new Vector3(913896, 6459191, 200);
mainInstance.camera.camera3D.lookAt(lookAt);
// Notify Giro3D we've changed the three.js camera position directly
mainInstance.notifyChange(mainInstance.camera.camera3D);

// Creates controls
const controls = new MapControls(mainInstance.camera.camera3D, mainInstance.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.2;

// you need to use these 2 lines each time you change the camera lookAt or position programatically
controls.target.copy(lookAt);
controls.saveState();

mainInstance.useTHREEControls(controls);

// add a skybox background
const cubeTextureLoader = new CubeTextureLoader();
cubeTextureLoader.setPath('image/skyboxsun25deg_zup/');
const cubeTexture = cubeTextureLoader.load([
    'px.jpg',
    'nx.jpg',
    'py.jpg',
    'ny.jpg',
    'pz.jpg',
    'nz.jpg',
]);

mainInstance.scene.background = cubeTexture;

/////////////////////////////// Minimap configuration //////////////////////////////////////////////

// The minimap is a regular Giro3D instance located in a <div> element in the top right corner
// of the window. Its configuration is very similar to the main view, with some important
// differences related to the camera and navigation.

// Create our minimap instance and attach it to the 'minimap' <div> element.
const minimapDiv = document.getElementById('minimap');

const minimapInstance = new Instance(minimapDiv, {
    crs: 'EPSG:3857', // Contrary to the main view, this minimap uses the Web mercator projection
});

// Set the minimap camera view width, in meters. This can be changed later when
// the user uses the mouse wheel on to zoom in/out.
const minimapCameraWidth = 2000;
const minimapCamera = new OrthographicCamera(
    -minimapCameraWidth / 2,
    minimapCameraWidth / 2,
    100,
    -100,
);

// We replace the default perspective camera of the minimap view by
// an orthographic camera, which is much more suitable for this kind of view.
minimapInstance.camera.camera3D = minimapCamera;

// Let's create our minimap map with the same extent than the main map.
const minimap = new Map('minimap', {
    extent: map.extent,
    // Since the map is flat (no terrain applied), we can use 1 segment per tile.
    segments: 1,
    backgroundColor: 'black',
    terrain: false, // We can disable terrain because our map will be flat.
});

minimapInstance.add(minimap);

// We use an OpenStreetMap color layer for the minimap, because it's readable and fast to display.
const osmLayer = new ColorLayer({
    name: 'osm',
    preloadImages: true,
    source: new TiledImageSource({ source: new OSM() }),
});

minimap.addLayer(osmLayer);

function synchronizeCameras() {
    const target = mainInstance.controls.target;

    // Since our minimap does not use the same projection as the main view (EPSG:2154),
    // we must convert the camera position into this projection (EPSG:3857).
    const srcProj = mainInstance.referenceCrs;
    const dstProj = minimapInstance.referenceCrs;
    const srcPosition = new Coordinates(srcProj, target.x, target.y);
    const position = srcPosition.as(dstProj);

    // Then we can assign the position to the camera, while still keeping a constant altitude.
    // The minimap camera "altitude" never changes because we are using an orthographic camera.
    // Changing this value will not change the size of objects rendered in this view.
    const MINIMAP_CAMERA_ALTITUDE = 10;
    minimapInstance.camera.camera3D.position.set(position.x, position.y, MINIMAP_CAMERA_ALTITUDE);

    // Instruct the minimap instance to render the view.
    minimapInstance.notifyChange(minimap);
}

// Synchronize the minimap camera position with the *target* of the main camera
mainInstance.addEventListener('after-camera-update', synchronizeCameras);

function handleMouseWheel(event) {
    const delta = event.wheelDelta;

    const ZOOM_SPEED = 1.5;

    if (delta > 0) {
        minimapCamera.zoom *= ZOOM_SPEED;
    } else if (delta < 0) {
        minimapCamera.zoom /= ZOOM_SPEED;
    }

    minimapInstance.notifyChange(minimapCamera);

    // Prevent this event from bubbling and make the page scroll.
    event.preventDefault();
}

// Use the mouse wheel on the minimap view to set the zoom of the minimap camera.
// We use the 'wheel' event (careful not to use the non-standard 'mousewheel' event).
minimapInstance.domElement.addEventListener('wheel', handleMouseWheel);

Inspector.attach(document.getElementById('panelDiv'), mainInstance, { title: 'main' });
Inspector.attach(document.getElementById('panelDiv'), minimapInstance, { title: 'minimap' });

StatusBar.bind(mainInstance, { additionalInstances: minimapInstance });
