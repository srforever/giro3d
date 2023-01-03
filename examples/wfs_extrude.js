import {
    Vector3, CubeTextureLoader,
} from 'three';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import VectorSource from 'ol/source/Vector.js';
import VectorTileSource from 'ol/source/VectorTile.js';
import TileWMS from 'ol/source/TileWMS.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/core/layer/LayerUpdateStrategy.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import {createXYZ} from 'ol/tilegrid.js';
import {tile} from 'ol/loadingstrategy.js';
import Vector from '@giro3d/giro3d/entities/FeatureCollection.js';
import Map from '@giro3d/giro3d/entities/Map.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// create a map
// const extent = new Extent('EPSG:2154', -111629.52, 1275028.84, 5976033.79, 7230161.64);
// Define geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3946',
    1837816.94334, 1847692.32501,
    5170036.4587, 5178412.82698,
);
// place camera above grenoble
const cameraPosition = new Coordinates(
    'EPSG:3946',
    extent.west(), extent.south(), 2000,
).xyz();

const tmpVec3 = new Vector3();

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, { crs: 'EPSG:3946' });

// Adds the map that will contain the layers.
const map = new Map('planar', { extent });
instance.add(map);

// Adds a WMS imagery layer
const wmsSource = new TileWMS({
    url: 'https://download.data.grandlyon.com/wms/grandlyon',
    projection: 'EPSG:3946',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['Ortho2018_Dalle_unique_8cm_CC46'],
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


const vectorSource = new VectorSource({
    format: new GeoJSON(),
    url: function url(extent) {
        return (
        'https://download.data.grandlyon.com/wfs/rdata'
            + '?SERVICE=WFS'
            + '&VERSION=2.0.0'
            + '&request=GetFeature'
            + '&typename=tcl_sytral.tcllignebus_2_0_0'
            + '&outputFormat=application/json;%20subtype=geojson'
            + '&SRSNAME=EPSG:3946'
            + '&startIndex=0'
            + '&bbox=' + extent.join(',') + ',EPSG:3946'
    );
    },
    strategy: tile(createXYZ({tileSize: 512})),
});

const vector = new Vector('test', {
  source: vectorSource,
    extent,
    minLevel: 2,
    maxLevel: 2, // TODO in source or in entity ???
  // style: new Style({
    // stroke: new Stroke({
      // color: 'rgba(0, 0, 255, 1.0)',
      // width: 2,
    // }),
  // }),
});

instance.add(vector);
window.instance = instance;

// add a skybox background
const cubeTextureLoader = new CubeTextureLoader();
cubeTextureLoader.setPath('image/skyboxsun25deg_zup/');
const cubeTexture = cubeTextureLoader.load([
    'px.jpg', 'nx.jpg',
    'py.jpg', 'ny.jpg',
    'pz.jpg', 'nz.jpg',
]);

instance.scene.background = cubeTexture;

// instance.camera.camera3D.position.set(912935, 6450784, 3727);
instance.camera.camera3D.position.copy(cameraPosition);
// const lookAt = new Vector3(913896, 6459191, 504);
// instance.camera.camera3D.lookAt(lookAt);
instance.notifyChange(instance.camera.camera3D);


// Creates controls
const controls = new MapControls(
    instance.camera.camera3D,
    viewerDiv,
);

// look at extent's  center
controls.target = extent.center().xyz();
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;
// controls.maxPolarAngle = Math.PI / 2.3;

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));
