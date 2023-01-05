import TileWMS from 'ol/source/TileWMS.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Vector from 'ol/source/Vector.js';
import { Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/core/layer/LayerUpdateStrategy.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Define geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3946',
    1837816.94334, 1847692.32501,
    5170036.4587, 5178412.82698,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
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
const wmsSource = new TileWMS({
    url: 'https://download.data.grandlyon.com/wms/grandlyon',
    projection: 'EPSG:3946',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['Ortho2009_vue_ensemble_16cm_CC46'],
    },
    version: '1.3.0',
});

const colorLayer = new ColorLayer(
    'wms_imagery',
    {
        source: wmsSource,
        updateStrategy: {
            type: STRATEGY_DICHOTOMY,
            options: {},
        },
    },
);
map.addLayer(colorLayer);

// Adds a WFS imagery layer
const wfsSource = new Vector({
    format: new GeoJSON({ dataProjection: 'EPSG:3946' }),
    url: 'https://download.data.grandlyon.com/wfs/rdata'
    + '?SERVICE=WFS'
    + '&VERSION=2.0.0'
    + '&request=GetFeature'
    + '&typename=tcl_sytral.tcllignebus_2_0_0'
    + '&outputFormat=application/json;%20subtype=geojson'
    + '&SRSNAME=EPSG:3946'
    + '&startIndex=0',
});
wfsSource.loadFeatures();

const wfsLayer = new ColorLayer(
    'lyon_tcl_bus',
    {
        source: wfsSource,
    },
);

wfsLayer.source.addEventListener('featuresloadend', () => {
    // Sets the style
    // The color is deduced from the gid of the layer
    let minGid = Infinity;
    let maxGid = -Infinity;
    wfsLayer.source.getFeatures().forEach(feature => {
        if (feature.values_.gid > maxGid) maxGid = feature.values_.gid;
        if (feature.values_.gid < minGid) minGid = feature.values_.gid;
    });
    wfsLayer.style = (Style, Fill, Stroke) => feature => {
        const hue = ((feature.values_.gid - minGid) / (maxGid - minGid)) * 360;
        return new Style({
            stroke: new Stroke({
                color: `hsl(${hue}, 90%, 50%)`,
                width: 1,
            }),
        });
    };

    instance.notifyChange(wfsLayer);
});

map.addLayer(wfsLayer);

// Creates controls
const controls = new MapControls(
    instance.camera.camera3D,
    viewerDiv,
);

instance.camera.camera3D.position.set(1839739, 5171618, 910);
controls.target = new Vector3(1840839, 5172718, 0);
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));
