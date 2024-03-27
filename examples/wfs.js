import { getUid } from 'ol';
import { Stroke, Style } from 'ol/style.js';
import { GeoJSON } from 'ol/format.js';
import TileWMS from 'ol/source/TileWMS.js';
import { MathUtils, Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import VectorSource from '@giro3d/giro3d/sources/VectorSource.js';

import StatusBar from './widgets/StatusBar.js';

// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
Instance.registerCRS(
    'EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);

// Define geographic extent: CRS, min/max X, min/max Y
const extent = new Extent('EPSG:3946', 1837816.94334, 1847692.32501, 5170036.4587, 5178412.82698);

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Instantiate Giro3D
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x0a3b59,
    },
});

const map = new Map('map', { extent });
instance.add(map);

// Adds a WMS imagery layer
const colorSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://data.geopf.fr/wms-r',
        projection: 'EPSG:3946',
        params: {
            LAYERS: ['HR.ORTHOIMAGERY.ORTHOPHOTOS'],
            FORMAT: 'image/jpeg',
        },
    }),
});

const colorLayer = new ColorLayer({
    name: 'orthoimagery',
    extent,
    source: colorSource,
});
map.addLayer(colorLayer);

const featureColors = new window.Map();

function getColor(id) {
    if (featureColors.has(id)) {
        return featureColors.get(id);
    }
    const hue = MathUtils.randFloat(0, 360);
    const color = `hsl(${hue}, 90%, 50%)`;

    featureColors.set(id, color);
    return color;
}

const style = feature => {
    const id = getUid(feature);
    return new Style({
        stroke: new Stroke({
            color: getColor(id),
            width: 1,
        }),
    });
};

// Adds a WFS imagery layer
const wfsSource = new VectorSource({
    format: new GeoJSON(),
    dataProjection: 'EPSG:3946',
    data:
        'https://download.data.grandlyon.com/wfs/rdata' +
        '?SERVICE=WFS' +
        '&VERSION=2.0.0' +
        '&request=GetFeature' +
        '&typename=tcl_sytral.tcllignebus_2_0_0' +
        '&outputFormat=application/json;%20subtype=geojson' +
        '&SRSNAME=EPSG:3946' +
        '&startIndex=0',
    style,
});

const wfsLayer = new ColorLayer({
    name: 'lyon_tcl_bus',
    extent,
    source: wfsSource,
});

map.addLayer(wfsLayer);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

instance.camera.camera3D.position.set(1839739, 5171618, 910);
controls.target = new Vector3(1840839, 5172718, 0);
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
