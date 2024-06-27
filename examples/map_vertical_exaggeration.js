import { MathUtils, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import Instance from '@giro3d/giro3d/core/Instance.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import ColorMap from '@giro3d/giro3d/core/layer/ColorMap.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import AxisGrid from '@giro3d/giro3d/entities/AxisGrid.js';
import CogSource from '@giro3d/giro3d/sources/CogSource.js';

import StatusBar from './widgets/StatusBar.js';

import { makeColorRamp } from './widgets/makeColorRamp.js';
import { bindSlider } from './widgets/bindSlider.js';
import { bindToggle } from './widgets/bindToggle.js';
import { bindButton } from './widgets/bindButton.js';

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, { crs: 'EPSG:3857', renderer: { clearColor: false } });

const minAltitude = -1531;
const maxAltitude = 2388;

// create a map
const extent = new Extent(
    instance.referenceCrs,
    -13576103.933,
    -13532051.346,
    5894667.439,
    5939002.826,
).withMargin(-200, -200);

const map = new Map('planar', {
    extent,
    backgroundColor: 'gray',
    hillshading: {
        enabled: true,
        intensity: 0.75,
        zFactor: 1,
        azimuth: 254,
    },
    discardNoData: true,
    doubleSided: true,
});

// Forces the map to subdivide more than usual, for better readability of tiles.
map.subdivisionThreshold = 0.75;

instance.add(map);

// Use an elevation COG with nodata values
const source = new CogSource({
    // https://www.sciencebase.gov/catalog/item/632a9a9ad34e71c6d67b95a3
    url: 'https://3d.oslandia.com/giro3d/rasters/topobathy.cog.tiff',
    crs: extent.crs(),
});

const elevationLayer = new ElevationLayer({
    source,
    minmax: { min: minAltitude, max: maxAltitude },
    preloadImages: true,
    colorMap: new ColorMap(makeColorRamp('bathymetry'), minAltitude + 200, maxAltitude - 200),
});

map.addLayer(elevationLayer);

const axisGrid = new AxisGrid('axis-grid', {
    volume: {
        extent: map.extent,
        floor: -2000,
        ceiling: 2500,
    },
    ticks: {
        x: 10_000,
        y: 10_000,
        z: 500,
    },
});

instance.add(axisGrid);

const center = extent.centerAsVector2();

instance.camera.camera3D.position.set(-13609580, 5858793, 32757);
const lookAt = new Vector3(center.x, center.y, 0);
instance.camera.camera3D.lookAt(lookAt);

instance.notifyChange(instance.camera.camera3D);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.2;

// you need to use these 2 lines each time you change the camera lookAt or position programatically
controls.target.copy(lookAt);
controls.saveState();

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

const sphere = new Mesh(new SphereGeometry(1), new MeshBasicMaterial({ color: 'red' }));

const tmpOrigin = new Vector3();
const tmpSize = new Vector3();
const tmpPosition = new Vector3();

// Make the sphere constant size on the screen
sphere.onBeforeRender = function onBeforeRender(renderer, _scene, camera) {
    const origin = camera.getWorldPosition(tmpOrigin);
    const dist = origin.distanceTo(sphere.getWorldPosition(tmpPosition));

    const fovRads = MathUtils.degToRad(camera.fov);
    const fieldOfViewHeight = Math.tan(fovRads) * dist;

    const size = renderer.getSize(tmpSize);

    const radius = 5; // pixels
    const pixelRatio = radius / size.y;

    const scale = fieldOfViewHeight * pixelRatio;

    // We also have to apply a counteracting z-scale to the
    // sphere in order to keep its round shape, otherwise
    // it will be squeezed by the z-scale.
    sphere.scale.set(scale, scale, scale / instance.scene.scale.z);

    sphere.updateMatrixWorld(true);
};

instance.add(sphere);

function getRawPickedPoint(mouseEvent) {
    const picked = instance.pickObjectsAt(mouseEvent, { where: [map] });
    if (picked.length > 0) {
        const first = picked[0];
        const point = first.point;
        return point;
    }

    return null;
}

function sampleElevationOnMap(point) {
    const getElevation = map.getElevation({
        coordinates: new Coordinates(instance.referenceCrs, point.x, point.y),
    });
    if (getElevation.samples.length > 0) {
        getElevation.samples.sort((a, b) => a.resolution - b.resolution);
        return getElevation.samples[0].elevation;
    }

    return null;
}

function updateMeasurements(mouseEvent) {
    const point = getRawPickedPoint(mouseEvent);

    const rawHeightCell = document.getElementById('raw-height');
    const adjustedHeightCell = document.getElementById('adjusted-height');
    const rasterHeightCell = document.getElementById('raster-height');

    if (point) {
        // The raw Z value is in scene units.
        const rawZ = point.z;

        // To obtain the actual elevation in geospatial
        // units (meters), we need to divided by the z-scale.
        const unscaledZ = rawZ / instance.scene.scale.z;

        // We can also compare those values with the elevation
        // sampled directly on elevation data (rasters).
        const sampledZ = sampleElevationOnMap(point);

        // Warning! Here we have to position the sphere to the unscaled Z value
        // because the entire scene is already scaled. Applying the raw Z value means
        // that the Z-scale will be applied twice on the sphere !
        sphere.position.set(point.x, point.y, unscaledZ);

        // We also have to apply a counteracting scale to the
        // sphere in order to keep its round shape, otherwise
        // it will be squeezed by the z-scale.
        sphere.scale.setZ(1 / instance.scene.scale.z);

        sphere.updateMatrixWorld();

        rawHeightCell.innerText = `${rawZ?.toFixed(2)}`;
        adjustedHeightCell.innerText = `${unscaledZ?.toFixed(2)} m`;
        rasterHeightCell.innerText = `${sampledZ?.toFixed(3)} m`;

        sphere.visible = true;
    } else {
        rawHeightCell.innerText = '-';
        adjustedHeightCell.innerText = '-';
        rasterHeightCell.innerText = '-';

        sphere.visible = false;
    }

    instance.notifyChange();
}

instance.domElement.addEventListener('mousemove', updateMeasurements);

// Bind events
StatusBar.bind(instance);

const showColliders = bindToggle('show-colliders', v => {
    map.materialOptions.showColliderMeshes = v;
    instance.notifyChange(map);
});

const showGrid = bindToggle('show-grid', v => {
    axisGrid.visible = v;
    instance.notifyChange();
});

const setGeometricResolution = bindSlider('geometric-resolution', v => {
    map.segments = 2 ** v;
    instance.notifyChange(map);

    document.getElementById('label-geometric-resolution').innerText =
        `Terrain mesh resolution: ${map.segments}`;
});

const setWireframe = bindToggle('wireframe', v => {
    map.wireframe = v;
    map.traverseMaterials(m => (m.wireframe = v));
    instance.notifyChange(map);
});

const setVerticalExaggeration = bindSlider('vertical-exaggeration', v => {
    // Vertical exaggerations simply means that the entire scene is scaled vertically.
    instance.scene.scale.setZ(v);

    // Changing the position, rotation or scale of an object requires the
    // recomputation of the transformation matrices of the object and its descendants.
    // Since the scene is the root object of the entire instance, updating it will
    // update all the objects in the scene as well.
    instance.scene.updateWorldMatrix(true, true);

    // By default, vertical exaggeration has no effect on shading,
    // so let's apply it to hillshading to increase the shading intensity
    // when the vertical exaggeration increases.
    map.materialOptions.hillshading.zFactor = v;

    instance.notifyChange(map);

    const percent = Math.round(v * 100);

    document.getElementById('label-vertical-exaggeration').innerHTML =
        `Z-scale: <span class="fw-bold ${percent === 100 ? 'text-success' : ''}">${percent}%</span>`;
});

instance.addEventListener('before-render', () => {
    const camera = instance.camera.camera3D;
    camera.near = 1000;
    camera.far = 200000;
});

bindButton('reset', () => {
    showGrid(true);
    showColliders(false);
    setVerticalExaggeration(1);
    setGeometricResolution(5);
    setWireframe(false);
});
