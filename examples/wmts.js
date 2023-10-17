import { WMTSCapabilities } from 'ol/format.js';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import StatusBar from './widgets/StatusBar.js';

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
const map = new Map('planar', { extent });

instance.add(map);

// We use OpenLayer's optionsFromCapabilities to parse the capabilities document
// and create our WMTS source.
fetch('https://wxs.ign.fr/essentiels/geoportail/wmts?service=WMTS&request=GetCapabilities')
    .then(async response => {
        const data = await response.text();
        const parser = new WMTSCapabilities();
        const capabilities = parser.read(data);
        const options = optionsFromCapabilities(capabilities, {
            layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2',
            tileMatrix: 'PM',
        });

        const source = new TiledImageSource({ source: new WMTS(options), extent });
        map.addLayer(new ColorLayer('wmts', { source }));
    })
    .catch(e => console.error(e));

instance.camera.camera3D.position.set(0, 0, 80000000);

const controls = new MapControls(instance.camera.camera3D, instance.domElement);

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
