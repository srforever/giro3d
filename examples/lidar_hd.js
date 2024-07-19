import TileWMS from 'ol/source/TileWMS.js';

import { Vector3, CubeTextureLoader } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';

import StatusBar from './widgets/StatusBar.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS(
    'EPSG:2154',
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
);

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, { crs: 'EPSG:2154' });

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.2;

instance.useTHREEControls(controls);

// Adds a WMS imagery layer
const wmsOrthophotoSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://data.geopf.fr/wms-r',
        projection: 'EPSG:2154',
        crossOrigin: 'anonymous',
        params: {
            LAYERS: ['HR.ORTHOIMAGERY.ORTHOPHOTOS'],
            FORMAT: 'image/jpeg',
        },
    }),
});

const pointcloud = new Tiles3D(
    'pointcloud',
    new Tiles3DSource('https://3d.oslandia.com/lidar_hd/tileset.json'),
);
// add pointcloud to scene
instance
    .add(pointcloud)
    .then(() => instance.focusObject(pointcloud))
    .then(() => {
        const colorLayer = new ColorLayer({
            name: 'orthophoto-ign',
            // The extent is useful to restrict the processing of the image layer
            // (which is much bigger than our point cloud).
            extent: Extent.fromBox3('EPSG:2154', pointcloud.getBoundingBox()),
            source: wmsOrthophotoSource,
        });
        return pointcloud.attach(colorLayer);
    })
    .then(() => {
        instance.renderingOptions.enableEDL = true;
        instance.renderingOptions.enableInpainting = true;
        instance.renderingOptions.enablePointCloudOcclusion = true;

        // refresh scene
        instance.notifyChange(instance.camera.camera3D);
        Inspector.attach(document.getElementById('panelDiv'), instance);
    });

// add a skybox background
const cubeTextureLoader = new CubeTextureLoader();
cubeTextureLoader.setPath('image/skyboxsun25deg_zup/');
const cubeTexture = cubeTextureLoader.load([
    'px.jpg',
    'nx.jpg',
    'py.jpg',
    'ny.jpg',
    'pz.jpg',
    'nz.jpg',
]);

instance.scene.background = cubeTexture;

// Bind events
StatusBar.bind(instance);
