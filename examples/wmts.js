import { WMTSCapabilities } from 'ol/format.js';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import WmtsSource from '@giro3d/giro3d/sources/WmtsSource.js';

import StatusBar from './widgets/StatusBar.js';

const extent = new Extent(
    'EPSG:3857',
    -20037508.342789244,
    20037508.342789244,
    -20037508.342789244,
    20037508.342789244,
);

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a Giro3D instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x0a3b59,
    },
});

// Creates a map that will contain the layer
const map = new Map('planar', { extent });

instance.add(map);

// For convenience, we use the fromCapabilities() async method to construct a WmtsSource from
// a WMTS capabilities document.
WmtsSource.fromCapabilities(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities',
    {
        layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2',
        tileMatrix: 'PM',
    },
)
    .then(source => {
        map.addLayer(new ColorLayer({ name: 'wmts', source }));
    })
    .catch(e => console.error(e));

instance.camera.camera3D.position.set(0, 0, 80000000);

const controls = new MapControls(instance.camera.camera3D, instance.domElement);

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
