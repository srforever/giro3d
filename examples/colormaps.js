/* eslint-disable no-lone-blocks */
import colormap from 'colormap';
import { Color, Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Interpretation from '@giro3d/giro3d/core/layer/Interpretation.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import ColorMap from '@giro3d/giro3d/core/layer/ColorMap.js';
import ColorMapMode from '@giro3d/giro3d/core/layer/ColorMapMode.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import XYZ from 'ol/source/XYZ.js';

import StatusBar from './widgets/StatusBar.js';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = Extent.fromCenterAndSize('EPSG:3857', { x: 697313, y: 5591324 }, 30000, 30000);

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the Giro3D instance
const instance = new Instance(viewerDiv, { crs: extent.crs() });

// Sets the camera position
const cameraPosition = new Vector3(659567, 5553543, 25175);
instance.camera.camera3D.position.copy(cameraPosition);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

// Then looks at extent's center
controls.target = extent.centerAsVector3();
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

instance.useTHREEControls(controls);

const elevationMin = 780;
const elevationMax = 3574;

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

const key =
    'pk.eyJ1IjoidG11Z3VldCIsImEiOiJjbGJ4dTNkOW0wYWx4M25ybWZ5YnpicHV6In0.KhDJ7W5N3d1z3ArrsDjX_A';
const source = new TiledImageSource({
    source: new XYZ({
        url: `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${key}`,
        projection: extent.crs(),
        crossOrigin: 'anonymous',
    }),
});

const elevationLayer = new ElevationLayer({
    name: 'elevation',
    extent,
    source,
    colorMap: new ColorMap(colorRamps.viridis, elevationMin, elevationMax, ColorMapMode.Elevation),
    interpretation: Interpretation.MapboxTerrainRGB,
});

const bottomLayer = new ColorLayer({
    name: 'color',
    extent,
    source,
    colorMap: new ColorMap(colorRamps.jet, elevationMin, elevationMax, ColorMapMode.Elevation),
    interpretation: Interpretation.MapboxTerrainRGB,
});

const topLayer = new ColorLayer({
    name: 'color2',
    extent,
    source,
    colorMap: new ColorMap(colorRamps.earth, elevationMin, elevationMax, ColorMapMode.Elevation),
    interpretation: Interpretation.MapboxTerrainRGB,
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
