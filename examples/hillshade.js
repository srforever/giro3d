import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import TileWMS from 'ol/source/TileWMS.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import Interpretation from '@giro3d/giro3d/core/layer/Interpretation.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import StatusBar from './widgets/StatusBar.js';

// # Planar (EPSG:3946) viewer

// Defines projection that we will use (taken from https://epsg.io/3946, Proj4js section)
Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3946',
    1837816.94334, 1847692.32501,
    5170036.4587, 5178412.82698,
);

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');
// Creates the giro3d instance
const instance = new Instance(viewerDiv, { crs: extent.crs() });

// Adds the map that will contain the layers.
const map = new Map('planar', {
    extent,
    // Enables hillshading on this map
    hillshading: {
        enabled: true,
        elevationLayersOnly: false,
    },
    segments: 64,
    backgroundColor: 'white',
});
instance.add(map);

// Adds a WMS imagery layer
const colorSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://download.data.grandlyon.com/wms/grandlyon',
        projection: 'EPSG:3946',
        params: {
            LAYERS: ['Ortho2018_Dalle_unique_8cm_CC46'],
            FORMAT: 'image/jpeg',
        },
        version: '1.3.0',
        crossOrigin: 'anonymous',
    }),
});

const colorLayer = new ColorLayer(
    'wms_imagery',
    {
        extent: extent.split(2, 1)[0],
        source: colorSource,
    },
);
map.addLayer(colorLayer);

// Adds a WMS elevation layer
const elevationSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://download.data.grandlyon.com/wms/grandlyon',
        projection: 'EPSG:3946',
        crossOrigin: 'anonymous',
        params: {
            LAYERS: ['MNT2018_Altitude_2m'],
            FORMAT: 'image/jpeg',
        },
        version: '1.3.0',
    }),
});

const min = 149;
const max = 621;

const elevationLayer = new ElevationLayer(
    'wms_elevation',
    {
        extent,
        minmax: { min, max },
        source: elevationSource,
        interpretation: Interpretation.ScaleToMinMax(min, max),
    },
);

map.addLayer(elevationLayer);

const mapCenter = extent.center().xyz();

// Sets the camera position
const cameraPosition = new Coordinates(
    'EPSG:3946',
    mapCenter.x, mapCenter.y - 1, 10000,
).xyz();
instance.camera.camera3D.position.copy(cameraPosition);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

// Then looks at extent's center
controls.target = mapCenter;
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

instance.useTHREEControls(controls);

const hillshadingCheckbox = document.getElementById('hillshadingCheckbox');
const hillshadingOptions = document.getElementById('hillshadingOptions');
const shadeColorLayersCheckbox = document.getElementById('colorLayers');

hillshadingCheckbox.oninput = function oninput() {
    const state = hillshadingCheckbox.checked;
    map.materialOptions.hillshading.enabled = state;
    instance.notifyChange(map);
    hillshadingOptions.disabled = !state;
};

shadeColorLayersCheckbox.oninput = function oninput() {
    const state = shadeColorLayersCheckbox.checked;
    map.materialOptions.hillshading.elevationLayersOnly = !state;
    instance.notifyChange(map);
};

const opacitySlider = document.getElementById('opacitySlider');

opacitySlider.oninput = function oninput() {
    const percentage = opacitySlider.value;
    const opacity = percentage / 100.0;
    colorLayer.opacity = opacity;
    instance.notifyChange(map);
    opacitySlider.innerHTML = `${percentage}%`;
};

const azimuthSlider = document.getElementById('azimuthSlider');

azimuthSlider.oninput = function oninput() {
    map.materialOptions.hillshading.azimuth = azimuthSlider.value;
    instance.notifyChange(map);
};

const zenithSlider = document.getElementById('zenithSlider');

zenithSlider.oninput = function oninput() {
    map.materialOptions.hillshading.zenith = zenithSlider.value;
    instance.notifyChange(map);
};

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
