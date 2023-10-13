import Stamen from 'ol/source/Stamen.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import StatusBar from './widgets/StatusBar.js';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    -20037508.342789244, 20037508.342789244,
    -20037508.342789244, 20037508.342789244,
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
const map = new Map('map', { extent });

instance.add(map);

const source = new TiledImageSource({ source: new Stamen({ layer: 'toner', wrapX: false }) });

const LAYER_COUNT = 16;

for (let i = 0; i < LAYER_COUNT; i++) {
    map.addLayer(new ColorLayer(`color layer ${i}`, { extent, source }));
}

// Instanciates camera
instance.camera.camera3D.position.set(0, 0, 25000000);

// Instanciates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
