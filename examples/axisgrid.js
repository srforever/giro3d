import colormap from 'colormap';
import { Color } from 'three';

import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import XYZ from 'ol/source/XYZ.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import AxisGrid, { TickOrigin } from '@giro3d/giro3d/entities/AxisGrid.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import Interpretation from '@giro3d/giro3d/core/layer/Interpretation.js';
import GeoTIFFFormat from '@giro3d/giro3d/formats/GeoTIFFFormat.js';
import ColorMap, { ColorMapMode } from '@giro3d/giro3d/core/layer/ColorMap.js';

import StatusBar from './widgets/StatusBar.js';

const x = -13602000;
const y = 5812000;
const halfWidth = 2500;

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    x - halfWidth, x + halfWidth,
    y - halfWidth, y + halfWidth,
);

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x0a3b59,
    },
});

// Creates a map that will contain the layer
const map = new Map('planar', {
    extent,
    hillshading: true,
    segments: 128,
    discardNoData: true,
    doubleSided: true,
    backgroundColor: 'white',
});

instance.add(map);

const source = new XYZ({
    minZoom: 10,
    maxZoom: 16,
    url: 'https://3d.oslandia.com/dem/MtStHelens-tiles/{z}/{x}/{y}.tif',
});
source.format = new GeoTIFFFormat();

const floor = 1100;
const ceiling = 2500;

const values = colormap({ colormap: 'viridis', nshades: 256 });
const colors = values.map(v => new Color(v));

const dem = new ElevationLayer('dem', {
    interpretation: Interpretation.Raw,
    source,
    colorMap: new ColorMap(
        colors,
        floor,
        ceiling,
        ColorMapMode.Elevation,
    ),
});

map.addLayer(dem);

// Create an axis grid that encompasses the Map.
const axisGrid = new AxisGrid('axis-grid', {
    volume: {
        extent: extent.withRelativeMargin(0.1),
        floor,
        ceiling,
    },
    ticks: {
        x: 1000,
        y: 1000,
        z: 200,
    },
});

instance.add(axisGrid);

instance.camera.camera3D.position.set(-13594700, 5819700, 7300);

// Instanciates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

controls.target.set(-13603000, 5811000, 0);

instance.useTHREEControls(controls);

// Manage GUI

function bindAxisStep(axis) {
    const slider = document.getElementById(`${axis}-axis-step`);
    slider.oninput = () => {
        axisGrid.ticks[axis] = parseInt(slider.value, 10);
        axisGrid.refresh();
        instance.notifyChange(axisGrid);
    };
}

function bindToggle(name, rebuild, action) {
    const toggle = document.getElementById(`toggle-${name}`);
    toggle.oninput = () => {
        const state = toggle.checked;
        action(state);
        if (rebuild) {
            axisGrid.refresh();
        }
        instance.notifyChange(axisGrid);
    };
}

bindAxisStep('x');
bindAxisStep('y');
bindAxisStep('z');

bindToggle('entity', false, v => { axisGrid.visible = v; });
bindToggle('origin', true, v => { axisGrid.origin = v ? TickOrigin.Relative : TickOrigin.Absolute; });
bindToggle('ceiling', false, v => { axisGrid.showCeilingGrid = v; });
bindToggle('floor', false, v => { axisGrid.showFloorGrid = v; });
bindToggle('sides', false, v => { axisGrid.showSideGrids = v; });

document.getElementById('randomize-position').onclick = () => {
    const current = axisGrid.volume.extent;
    const dims = current.dimensions();
    const center = current.center().xyz();
    const range = 5000;
    center.set(
        center.x + (Math.random() - 0.5) * range,
        center.y + (Math.random() - 0.5) * range,
        0,
    );
    const newExtent = new Extent(
        current.crs(),
        center.x - dims.x / 2,
        center.x + dims.x / 2,
        center.y - dims.y / 2,
        center.y + dims.y / 2,
    );

    axisGrid.volume.extent = newExtent;
    axisGrid.refresh();
    instance.notifyChange(axisGrid);
};

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
