/* eslint-disable no-lone-blocks */
import colormap from 'colormap';
import { Color } from 'three';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import Interpretation from '@giro3d/giro3d/core/layer/Interpretation.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import CustomTiledImageSource from '@giro3d/giro3d/sources/CustomTiledImageSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import ColorMap from '@giro3d/giro3d/core/layer/ColorMap.js';
import ColorMapMode from '@giro3d/giro3d/core/layer/ColorMapMode.js';
import StatusBar from './widgets/StatusBar.js';

Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

const extent = new Extent(
    'EPSG:2154',
    929748, 974519, 6400582, 6444926,
);

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the giro3d instance
const instance = new Instance(viewerDiv);

// Sets the camera position
const cameraPosition = new Coordinates(
    'EPSG:2154',
    extent.west(), extent.south(), 2000,
).xyz();
instance.camera.camera3D.position.copy(cameraPosition);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

// Then looks at extent's center
controls.target = extent.center().xyz();
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

instance.useTHREEControls(controls);

const elevationMin = 711; // Altitude corresponding to 0 in heightfield
const elevationMax = 3574; // Altitude corresponding to 255 in heightfield

function makeColorRamp(preset, nshades) {
    const values = colormap({ colormap: preset, nshades });
    const colors = values.map(v => new Color(v));

    return colors;
}

const colorRamps = {};

function makeColorRamps(discrete) {
    const nshades = discrete ? 10 : 256;

    colorRamps.viridis = makeColorRamp('viridis', nshades);
    colorRamps.jet = makeColorRamp('jet', nshades);
    colorRamps.blackbody = makeColorRamp('blackbody', nshades);
    colorRamps.earth = makeColorRamp('earth', nshades);
    colorRamps.bathymetry = makeColorRamp('bathymetry', nshades);
    colorRamps.magma = makeColorRamp('magma', nshades);
    colorRamps.par = makeColorRamp('par', nshades);

    colorRamps.slope = makeColorRamp('RdBu', nshades);
}

makeColorRamps(false);

// Adds the map that will contain the layers.
const map = new Map('planar', {
    extent,
    segments: 128,
    hillshading: true,
});
instance.add(map);

// Adds our Elevation source & layer
// Source data from IGN BD ALTI https://geoservices.ign.fr/bdalti
const demSource = new CustomTiledImageSource({
    url: 'https://3d.oslandia.com/ecrins/ecrins-dem.json',
    networkOptions: { crossOrigin: 'same-origin' },
});

const elevationLayer = new ElevationLayer('elevation', {
    colorMap: new ColorMap(
        colorRamps.viridis,
        elevationMin,
        elevationMax,
        ColorMapMode.Elevation,
    ),
    source: demSource,
    interpretation: Interpretation.ScaleToMinMax(elevationMin, elevationMax),
    projection: 'EPSG:2154',
});

const bottomLayer = new ColorLayer('color', {
    colorMap: new ColorMap(
        colorRamps.viridis,
        elevationMin,
        elevationMax,
        ColorMapMode.Elevation,
    ),
    source: demSource,
    interpretation: Interpretation.ScaleToMinMax(elevationMin, elevationMax),
    projection: 'EPSG:2154',
});

const topLayer = new ColorLayer('color2', {
    colorMap: new ColorMap(
        colorRamps.viridis,
        elevationMin,
        elevationMax,
        ColorMapMode.Elevation,
    ),
    source: demSource,
    interpretation: Interpretation.ScaleToMinMax(elevationMin, elevationMax),
    projection: 'EPSG:2154',
});

map.addLayer(elevationLayer);
map.addLayer(bottomLayer);
map.addLayer(topLayer);

function updateLayer(prefix, layer) {
    const enableLayer = document.getElementById(`${prefix}-layer-enable`);
    const enableColorMap = document.getElementById(`${prefix}-colormap-enable`);
    const gradient = document.getElementById(`${prefix}-gradient`);

    const colorMap = layer.colorMap;

    layer.visible = enableLayer.checked;
    colorMap.active = enableColorMap.checked;
    colorMap.colors = colorRamps[gradient.value];

    function updateMode(value) {
        switch (value) {
            case 'slope':
                gradient.disabled = true;
                colorMap.colors = colorRamps.slope;
                colorMap.mode = ColorMapMode.Slope;
                colorMap.min = 0;
                colorMap.max = 50;
                break;
            case 'aspect':
                gradient.disabled = true;
                colorMap.colors = colorRamps.slope;
                colorMap.mode = ColorMapMode.Aspect;
                colorMap.min = 0;
                colorMap.max = 360;
                break;
            default:
                gradient.disabled = false;
                colorMap.colors = colorRamps[gradient.value];
                colorMap.mode = ColorMapMode.Elevation;
                colorMap.min = elevationMin;
                colorMap.max = elevationMax;
                break;
        }
    }

    const mode = document.getElementById(`${prefix}-mode`);
    updateMode(mode.value);

    instance.notifyChange(map);
}

function bindControls(prefix, layer) {
    const notify = () => updateLayer(prefix, layer);

    const enableLayer = document.getElementById(`${prefix}-layer-enable`);
    const layerOptions = document.getElementById(`${prefix}-options`);
    enableLayer.onchange = () => {
        notify();
        layerOptions.disabled = !enableLayer.checked;
    };

    const enableColorMap = document.getElementById(`${prefix}-colormap-enable`);
    const colormapOptions = document.getElementById(`${prefix}-colormap-options`);
    enableColorMap.onchange = () => {
        notify();
        colormapOptions.disabled = !enableColorMap.checked;
    };

    const gradient = document.getElementById(`${prefix}-gradient`);
    gradient.onchange = () => {
        notify();
    };

    const mode = document.getElementById(`${prefix}-mode`);
    mode.onchange = () => notify();

    notify();
}

bindControls('elevation', elevationLayer);
bindControls('bottom', bottomLayer);
bindControls('top', topLayer);

const discreteToggle = document.getElementById('discrete-ramps');

discreteToggle.onchange = () => {
    makeColorRamps(discreteToggle.checked);
    updateLayer('elevation', elevationLayer);
    updateLayer('bottom', bottomLayer);
    updateLayer('top', topLayer);
};

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
