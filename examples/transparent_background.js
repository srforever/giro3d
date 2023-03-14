import colormap from 'colormap';
import { Color } from 'three';

import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import XYZ from 'ol/source/XYZ.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
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

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: false,
    },
});

const map = new Map('planar', {
    extent,
    hillshading: true,
    segments: 128,
    doubleSided: true,
    backgroundColor: 'white',
});

instance.add(map);

const source = new XYZ({
    minZoom: 0,
    maxZoom: 15,
    url: 'https://3d.oslandia.com/dem/tiles/{z}/{x}/{-y}-f32.tif',
});
source.format = new GeoTIFFFormat();

const floor = 1100;
const ceiling = 2500;

const values = colormap({ colormap: 'viridis' });
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

instance.camera.camera3D.position.set(-13594700, 5819700, 7300);

const controls = new MapControls(instance.camera.camera3D, viewerDiv);

controls.target.set(-13603000, 5811000, 0);

instance.useTHREEControls(controls);

instance.notifyChange();

StatusBar.bind(instance);
