import colormap from 'colormap';
import { Color } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import XYZ from 'ol/source/XYZ.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import GeoTIFFFormat from '@giro3d/giro3d/formats/GeoTIFFFormat.js';
import ColorMap, { ColorMapMode } from '@giro3d/giro3d/core/layer/ColorMap.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

import StatusBar from './widgets/StatusBar.js';

const x = -13602000;
const y = 5812000;
const halfWidth = 2500;

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent('EPSG:3857', x - halfWidth, x + halfWidth, y - halfWidth, y + halfWidth);

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, { crs: extent.crs() });

const map = new Map('planar', {
    extent,
    hillshading: {
        enabled: true,
        intensity: 0.5,
    },
    doubleSided: true,
    backgroundColor: 'white',
    contourLines: true,
});

instance.add(map);

const source = new TiledImageSource({
    source: new XYZ({
        minZoom: 10,
        maxZoom: 16,
        url: 'https://3d.oslandia.com/dem/MtStHelens-tiles/{z}/{x}/{y}.tif',
    }),
    format: new GeoTIFFFormat(),
});

const floor = 1100;
const ceiling = 2500;

const values = colormap({ colormap: 'viridis', nshades: 256 });
const colors = values.map(v => new Color(v));

const dem = new ElevationLayer({
    name: 'dem',
    source,
    extent,
    colorMap: new ColorMap(colors, floor, ceiling, ColorMapMode.Elevation),
});

map.addLayer(dem);

instance.camera.camera3D.position.set(-13594700, 5819700, 7300);

const controls = new MapControls(instance.camera.camera3D, instance.domElement);

controls.target.set(-13603000, 5811000, 0);

instance.useTHREEControls(controls);

instance.notifyChange();

StatusBar.bind(instance);
Inspector.attach(document.getElementById('panelDiv'), instance);

const checkbox = document.getElementById('contourLineCheckbox');
checkbox.oninput = function oninput() {
    const state = checkbox.checked;
    map.materialOptions.contourLines.enabled = state;
    instance.notifyChange(map);
};

function bindSlider(name, fn) {
    const slider = document.getElementById(name);
    slider.oninput = function oninput() {
        fn(slider.value);
        instance.notifyChange(map);
    };
}

function bindDropDown(name, fn) {
    const mode = document.getElementById(name);
    mode.onchange = () => {
        fn(Number.parseFloat(mode.value));
        instance.notifyChange(map);
    };
}

bindDropDown('mainInterval', v => {
    map.materialOptions.contourLines.interval = v;
});
bindDropDown('secondaryInterval', v => {
    map.materialOptions.contourLines.secondaryInterval = v;
});
bindSlider('opacitySlider', v => {
    map.materialOptions.contourLines.opacity = v;
});
bindSlider('thicknessSlider', v => {
    map.materialOptions.contourLines.thickness = v;
});
