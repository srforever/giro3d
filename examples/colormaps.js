import colormap from 'colormap';

import { MathUtils, Color } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import XYZ from 'ol/source/XYZ.js';

import * as FunctionCurveEditor from 'function-curve-editor';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import MapboxTerrainFormat from '@giro3d/giro3d/formats/MapboxTerrainFormat.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import ColorMap from '@giro3d/giro3d/core/layer/ColorMap.js';
import ColorMapMode from '@giro3d/giro3d/core/layer/ColorMapMode.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import { ColorLayer } from '@giro3d/giro3d/core/layer/index.js';

import StatusBar from './widgets/StatusBar.js';

import { bindToggle } from './widgets/bindToggle.js';
import { bindSlider } from './widgets/bindSlider.js';
import { bindDropDown } from './widgets/bindDropDown.js';
import { bindButton } from './widgets/bindButton.js';
import { makeColorRamp } from './widgets/makeColorRamp.js';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = Extent.fromCenterAndSize('EPSG:3857', { x: 697313, y: 5591324 }, 30000, 30000);

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the Giro3D instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        // To display the background style
        clearColor: false,
    },
});

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

controls.enableDamping = true;
controls.dampingFactor = 0.2;

instance.useTHREEControls(controls);

const elevationMin = 780;
const elevationMax = 3574;

let parameters = {
    ramp: 'viridis',
    discrete: false,
    invert: false,
    mirror: false,
    backgroundOpacity: 1,
    transparencyCurveKnots: [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
    ],
    enableColorMap: true,
    layerType: 'elevation',
    colors: makeColorRamp('viridis', false, false, false),
    min: elevationMin,
    max: elevationMax,
    mode: ColorMapMode.Elevation,
};

function updatePreview(colors) {
    const canvas = document.getElementById('gradient');
    const ctx = canvas.getContext('2d');

    canvas.width = colors.length;
    canvas.height = 1;

    for (let i = 0; i < colors.length; i++) {
        const color = colors[i];
        ctx.fillStyle = `#${color.getHexString()}`;
        ctx.fillRect(i, 0, 1, canvas.height);
    }
}

updatePreview(parameters.colors);

// Adds the map that will contain the layers.
const map = new Map('planar', {
    extent,
    backgroundColor: 'cyan',
    doubleSided: true,
    hillshading: {
        enabled: true,
        elevationLayersOnly: true,
    },
});
instance.add(map).then(() => instance.focusObject(map));

const key =
    'pk.eyJ1IjoidG11Z3VldCIsImEiOiJjbGJ4dTNkOW0wYWx4M25ybWZ5YnpicHV6In0.KhDJ7W5N3d1z3ArrsDjX_A';
const source = new TiledImageSource({
    format: new MapboxTerrainFormat(),
    source: new XYZ({
        url: `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${key}`,
        projection: extent.crs(),
        crossOrigin: 'anonymous',
    }),
});

const backgroundLayer = new ColorLayer({
    name: 'background',
    extent,
    source: new TiledImageSource({
        source: new XYZ({
            url: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.webp?access_token=${key}`,
            projection: extent.crs(),
            crossOrigin: 'anonymous',
        }),
    }),
});

const elevationLayer = new ElevationLayer({
    name: 'elevation',
    extent,
    source,
    colorMap: new ColorMap(parameters.colors, elevationMin, elevationMax, ColorMapMode.Elevation),
});

const colorLayer = new ColorLayer({
    name: 'color',
    extent,
    source,
    colorMap: new ColorMap(parameters.colors, elevationMin, elevationMax, ColorMapMode.Elevation),
});

map.addLayer(elevationLayer);

let activeLayer = elevationLayer;

function updateColorRamp() {
    parameters.colors = makeColorRamp(
        parameters.ramp,
        parameters.discrete,
        parameters.invert,
        parameters.mirror,
    );
    activeLayer.colorMap.colors = parameters.colors;
    activeLayer.colorMap.min = parameters.min;
    activeLayer.colorMap.max = parameters.max;
    activeLayer.colorMap.mode = parameters.mode;

    updateTransparency();

    updatePreview(parameters.colors);

    instance.notifyChange(map);
}

const setEnableColorMap = bindToggle('enable', v => {
    elevationLayer.visible = true;
    colorLayer.visible = true;
    backgroundLayer.visible = true;

    if (activeLayer.type === 'ColorLayer') {
        activeLayer.visible = v;
    } else {
        activeLayer.colorMap.active = v;
    }
    instance.notifyChange(map);
});
const setDiscrete = bindToggle('discrete', v => {
    parameters.discrete = v;
    updateColorRamp();
});
const setInvert = bindToggle('invert', v => {
    parameters.invert = v;
    updateColorRamp();
});
const setMirror = bindToggle('mirror', v => {
    parameters.mirror = v;
    updateColorRamp();
});
const setRamp = bindDropDown('ramp', v => {
    parameters.ramp = v;
    updateColorRamp();
});
function setActiveLayers(...layers) {
    map.removeLayer(colorLayer);
    map.removeLayer(elevationLayer);
    map.removeLayer(backgroundLayer);

    for (const layer of layers) {
        map.addLayer(layer);
    }
    activeLayer = layers[layers.length - 1];
}
const setLayerType = bindDropDown('layerType', v => {
    switch (v) {
        case 'elevation':
            setActiveLayers(elevationLayer);
            break;
        case 'color':
            setActiveLayers(colorLayer);
            break;
        case 'color+background':
            setActiveLayers(backgroundLayer, colorLayer);
            break;
        case 'color+background+elevation':
            setActiveLayers(elevationLayer, backgroundLayer, colorLayer);
            break;
    }
    updateColorRamp();
    instance.notifyChange(map);
});
const setBackgroundOpacity = bindSlider('backgroundOpacity', v => {
    map.materialOptions.backgroundOpacity = v;
    instance.notifyChange(map);
});
const updateBounds = bindColorMapBounds((min, max) => {
    parameters.min = min;
    parameters.max = max;
    activeLayer.colorMap.min = min;
    activeLayer.colorMap.max = max;
    instance.notifyChange(map);
});

let suffix = 'm';

const setMode = bindDropDown('mode', v => {
    const numerical = Number.parseInt(v);
    switch (numerical) {
        case ColorMapMode.Elevation:
            parameters.mode = ColorMapMode.Elevation;
            updateBounds(elevationMin, elevationMax);
            suffix = 'm';
            break;
        case ColorMapMode.Slope:
            parameters.mode = ColorMapMode.Slope;
            updateBounds(0, 90);
            suffix = '°';
            break;
        case ColorMapMode.Aspect:
            parameters.mode = ColorMapMode.Aspect;
            updateBounds(0, 360);
            suffix = '°';
            break;
    }

    updateColorRamp();
    instance.notifyChange(map);
});

function bindColorMapBounds(callback) {
    /** @type {HTMLInputElement} */
    const lower = document.getElementById('lower');

    /** @type {HTMLInputElement} */
    const upper = document.getElementById('upper');

    callback(lower.valueAsNumber, upper.valueAsNumber);

    function updateLabels() {
        document.getElementById('minLabel').innerText =
            `Lower bound: ${lower.valueAsNumber}${suffix}`;
        document.getElementById('maxLabel').innerText =
            `Upper bound: ${upper.valueAsNumber}${suffix}`;
    }

    lower.oninput = function oninput() {
        const rawValue = lower.valueAsNumber;
        const clampedValue = MathUtils.clamp(rawValue, lower.min, upper.valueAsNumber - 1);
        lower.valueAsNumber = clampedValue;
        callback(lower.valueAsNumber, upper.valueAsNumber);
        instance.notifyChange(map);
        updateLabels();
    };

    upper.oninput = function oninput() {
        const rawValue = upper.valueAsNumber;
        const clampedValue = MathUtils.clamp(rawValue, lower.valueAsNumber + 1, upper.max);
        upper.valueAsNumber = clampedValue;
        callback(lower.valueAsNumber, upper.valueAsNumber);
        instance.notifyChange(map);
        updateLabels();
    };

    return (min, max) => {
        lower.min = min;
        lower.max = max;
        upper.min = min;
        upper.max = max;
        lower.valueAsNumber = min;
        upper.valueAsNumber = max;
        callback(lower.valueAsNumber, upper.valueAsNumber);
        updateLabels();
    };
}

const canvas = document.getElementById('curve');
const widget = new FunctionCurveEditor.Widget(canvas);

function updateTransparency() {
    const length = parameters.colors.length;
    const f = widget.getFunction();
    const opacities = new Array(length);
    for (let i = 0; i < length; i++) {
        const t = i / length;
        opacities[i] = f(t);
    }
    activeLayer.colorMap.opacity = opacities;
}

function setupTransparencyCurve(knots = undefined) {
    // Curve editor
    const initialKnots = knots ?? [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
    ];

    widget.setEditorState({
        knots: initialKnots,
        xMin: -0.2,
        xMax: 1.2,
        yMin: -0.2,
        yMax: 1.2,
        interpolationMethod: 'linear',
        extendedDomain: true,
        relevantXMin: 0,
        relevantXMax: 1,
        gridEnabled: true,
    });

    widget.addEventListener('change', () => {
        updateColorRamp();
    });
}

setupTransparencyCurve();

function applyPreset(preset) {
    parameters = { ...preset };

    setupTransparencyCurve(preset.transparencyCurveKnots);
    setBackgroundOpacity(preset.backgroundOpacity);
    setRamp(preset.ramp);
    setEnableColorMap(preset.enableColorMap);
    setDiscrete(preset.discrete);
    setInvert(preset.invert);
    setMirror(preset.mirror);
    setMode(preset.mode);
    setLayerType(preset.layerType);
    updateBounds(preset.min, preset.max);
    updateColorRamp();

    instance.notifyChange(map);
}

const setPreset = bindDropDown('preset', preset => {
    switch (preset) {
        case 'elevation':
            applyPreset({
                ramp: 'viridis',
                transparencyCurveKnots: [
                    { x: 0, y: 1 },
                    { x: 1, y: 1 },
                ],
                backgroundOpacity: 1,
                enableColorMap: true,
                discrete: false,
                mirror: false,
                invert: false,
                layerType: 'elevation',
                colors: makeColorRamp('viridis', false, false, false),
                opacity: new Array(256).fill(1),
                min: elevationMin,
                max: elevationMax,
                mode: ColorMapMode.Elevation,
            });
            break;

        case 'elevation+transparency':
            applyPreset({
                ramp: 'jet',
                transparencyCurveKnots: [
                    { x: 0, y: 0.5 },
                    { x: 0.4, y: 0.5 },
                    { x: 0.401, y: 0 },
                    { x: 1, y: 0 },
                ],
                backgroundOpacity: 1,
                enableColorMap: true,
                discrete: false,
                mirror: false,
                invert: false,
                layerType: 'color+background+elevation',
                colors: makeColorRamp('jet', false, false, false),
                min: elevationMin,
                max: elevationMax,
                mode: ColorMapMode.Elevation,
            });
            break;

        case 'southern-slope':
            applyPreset({
                ramp: 'rdbu',
                transparencyCurveKnots: [
                    { x: 0, y: 0 },
                    { x: 0.4, y: 0 },
                    { x: 0.401, y: 1 },
                    { x: 0.6, y: 1 },
                    { x: 0.601, y: 0 },
                    { x: 1, y: 0 },
                ],
                backgroundOpacity: 1,
                enableColorMap: true,
                discrete: false,
                mirror: true,
                invert: false,
                layerType: 'color+background+elevation',
                colors: makeColorRamp('rdbu', false, false, false),
                min: 0,
                max: 360,
                mode: ColorMapMode.Aspect,
            });
            break;

        case 'flat-terrain':
            applyPreset({
                ramp: 'jet',
                transparencyCurveKnots: [
                    { x: 0, y: 1 },
                    { x: 0.3, y: 1 },
                    { x: 0.6, y: 0 },
                    { x: 1, y: 0 },
                ],
                backgroundOpacity: 1,
                enableColorMap: true,
                discrete: false,
                mirror: false,
                invert: true,
                layerType: 'color+background+elevation',
                colors: makeColorRamp('jet', false, false, false),
                min: 0,
                max: 35,
                mode: ColorMapMode.Slope,
            });
            break;
    }
});

function resetToDefaults() {
    setPreset('elevation');
}

bindButton('reset', resetToDefaults);

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);

// For some reason, not waiting a bit causes the curve editor to be blank on Firefox
setTimeout(resetToDefaults, 100);
