import TileWMS from 'ol/source/TileWMS.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import VectorSource from 'ol/source/Vector.js';
import {createXYZ} from 'ol/tilegrid.js';
import {tile} from 'ol/loadingstrategy.js';

import Instance from '@giro3d/giro3d/core/Instance.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/core/layer/LayerUpdateStrategy.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import BilFormat from '@giro3d/giro3d/formats/BilFormat.js';
import FeatureCollection from '@giro3d/giro3d/entities/FeatureCollection.js';

import {
    Vector3, CubeTextureLoader, DirectionalLight, MeshLambertMaterial, MeshBasicMaterial, MeshStandardMaterial, AmbientLight, sRGBEncoding
} from 'three';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';

import StatusBar from './widgets/StatusBar.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

const viewerDiv = document.getElementById('viewerDiv');
const instance = new Instance(viewerDiv, { crs: 'EPSG:2154' });
window.instance = instance;

// create a map
const extent = new Extent('EPSG:2154', -111629.52, 1275028.84, 5976033.79, 7230161.64);
const map = new Map('planar', {
    extent,
    hillshading: false,
    segments: 64,
    discardNoData: true,
    doubleSided: false,
});
instance.add(map);

// Create a WMS imagery layer
const wmsOthophotoSource = new TileWMS({
    url: 'https://wxs.ign.fr/ortho/geoportail/r/wms',
    projection: 'EPSG:2154',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['HR.ORTHOIMAGERY.ORTHOPHOTOS'],
        FORMAT: 'image/jpeg',
    },
    version: '1.3.0',
});

const colorLayer = new ColorLayer(
    'orthophoto-ign',
    {
        source: wmsOthophotoSource,
        updateStrategy: {
            type: STRATEGY_DICHOTOMY,
            options: {},
        },
    },
);
map.addLayer(colorLayer);

// Adds a WMS elevation layer
const elevationSource = new TileWMS({
    url: 'https://wxs.ign.fr/altimetrie/geoportail/r/wms',
    projection: 'EPSG:2154',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES'],
        FORMAT: 'image/x-bil;bits=32',
    },
    version: '1.3.0',
});

elevationSource.format = new BilFormat();

const elevationLayer = new ElevationLayer(
    'wms_elevation',
    {
        source: elevationSource,
        noDataValue: -1000,
    },
);
map.addLayer(elevationLayer);

const vectorSource = new VectorSource({
    format: new GeoJSON(),
    url: function url(extent) {
        return (
        'https://wxs.ign.fr/topographie/geoportail/wfs'
        // 'https://download.data.grandlyon.com/wfs/rdata'
            + '?SERVICE=WFS'
            + '&VERSION=2.0.0'
            + '&request=GetFeature'
            + '&typename=BDTOPO_V3:batiment'
            + '&outputFormat=application/json'
            + '&SRSNAME=EPSG:2154'
            + '&startIndex=0'
            + '&bbox=' + extent.join(',') + ',EPSG:2154'
        );
    },
    strategy: tile(createXYZ({tileSize: 512})),
});

const feat = new FeatureCollection('test', {
    source: vectorSource,
    extent,
    material: new MeshLambertMaterial(),
    extrude: (feat) => {
        const hauteur = -feat.getProperties().hauteur;
        if (isNaN(hauteur)) {
            return null;
        } else {
            return hauteur;
        }
    },
    color: (feat) => {
        if (feat.usage_1 === 'Résidentiel') {
            return '#9d9484';
        } else if (feat.usage_1 === 'Commercial et services') {
            return '#b0ffa7';
        }
        return '#FFFFFF';

    },
    minLevel: 11,
    maxLevel: 11
});

instance.add(feat);
instance.mainLoop.gfxEngine.renderer.outputEncoding = sRGBEncoding;

// also add some lights
const sun = new DirectionalLight('#ffffff', 0.7);
sun.position.set(1, 0, 1).normalize();
sun.updateMatrixWorld(true);
instance.scene.add(sun);

// We can look below the floor, so let's light also a bit there
const sun2 = new DirectionalLight('#ffffff', 0.5);
sun2.position.set(0, 1, 1);
sun2.updateMatrixWorld();
instance.scene.add(sun2);

// ambient
const ambientLight = new AmbientLight(0xffffff, 0.1);
instance.scene.add( ambientLight );

// place camera above grenoble
// instance.camera.camera3D.position.set(40, 40, 0);
instance.camera.camera3D.position.set(912935, 6450784, 3727);
// and look at the Bastille ;-)
const lookAt = new Vector3(913896, 6459191, 200);
// const lookAt = new Vector3(0, 0, 0);
// const lookAt = new Vector3(1006597, 6538731, 2000);
instance.camera.camera3D.lookAt(lookAt);
instance.notifyChange(instance.camera.camera3D);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.2;

// you need to use these 2 lines each time you change the camera lookAt or position programatically
controls.target.copy(lookAt);
controls.saveState();

instance.useTHREEControls(controls);

// add a skybox background
const cubeTextureLoader = new CubeTextureLoader();
cubeTextureLoader.setPath('image/skyboxsun25deg_zup/');
const cubeTexture = cubeTextureLoader.load([
    'px.jpg', 'nx.jpg',
    'py.jpg', 'ny.jpg',
    'pz.jpg', 'nz.jpg',
]);

instance.scene.background = cubeTexture;

Inspector.attach(document.getElementById('panelDiv'), instance);

// Bind events
StatusBar.bind(instance);
