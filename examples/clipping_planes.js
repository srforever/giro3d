import colormap from 'colormap';

import {
    Color,
    Vector3,
    Mesh,
    BoxGeometry,
    MeshBasicMaterial,
    Box3,
    Box3Helper,
    Group,
    Plane,
} from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import TileWMS from 'ol/source/TileWMS.js';

import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Tiles3D, { boundingVolumeToExtent } from '@giro3d/giro3d/entities/Tiles3D.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import BilFormat from '@giro3d/giro3d/formats/BilFormat.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import PointCloudMaterial, { MODE } from '@giro3d/giro3d/renderer/PointCloudMaterial.js';

import StatusBar from './widgets/StatusBar.js';

import { makeColorRamp } from './widgets/makeColorRamp.js';

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

const material = new PointCloudMaterial({
    size: 4,
    mode: MODE.ELEVATION,
});

material.colorMap.colors = makeColorRamp('rdbu').reverse();
material.colorMap.min = 200;
material.colorMap.max = 1800;

const pointcloud = new Tiles3D(
    'pointcloud',
    new Tiles3DSource('https://3d.oslandia.com/lidar_hd/tileset.json'),
    {
        material,
    },
);

/**
 * @type {Plane[]}
 */
let planes = null;

let boxSize = 3000;

/**
 * @param {Box3} box The box
 */
function getPlanesFromBoxSides(box) {
    const result = [];

    // Notice that when the plane has a positive normal, the distance to the box must be negated
    result.push(new Plane(new Vector3(0, 0, +1), -box.min.z));
    result.push(new Plane(new Vector3(0, 0, -1), +box.max.z));
    result.push(new Plane(new Vector3(+1, 0, 0), -box.min.x));
    result.push(new Plane(new Vector3(-1, 0, 0), +box.max.x));
    result.push(new Plane(new Vector3(0, +1, 0), -box.min.y));
    result.push(new Plane(new Vector3(0, -1, 0), +box.max.y));

    return result;
}

const options = {
    showHelper: true,
    enableClippingPlanes: true,
    applyOnMap: false,
    showMap: true,
    applyOnPointCloud: true,
    showPointCloud: true,
};

/**
 * @param {Tiles3D} pointCloud The point cloud entity.
 */
function setupScene(pointCloud) {
    const root = pointCloud.root;

    /** @type {Extent} */
    const extent = root.bbox
        ? Extent.fromBox3('EPSG:2154', root.bbox)
        : boundingVolumeToExtent('EPSG:2154', root.boundingVolume, root.matrixWorld);

    instance.renderingOptions.enableEDL = true;
    instance.renderingOptions.enableInpainting = true;
    instance.renderingOptions.enablePointCloudOcclusion = true;

    // create a map
    const map = new Map('terrain', {
        extent,
        hillshading: false,
        discardNoData: true,
        doubleSided: true,
    });
    instance.add(map);

    // Create a WMS imagery layer
    const wmsOthophotoSource = new TiledImageSource({
        source: new TileWMS({
            url: 'https://data.geopf.fr/wms-r',
            projection: 'EPSG:2154',
            params: {
                LAYERS: ['HR.ORTHOIMAGERY.ORTHOPHOTOS'],
                FORMAT: 'image/jpeg',
            },
        }),
    });

    const colorLayer = new ColorLayer({
        name: 'orthophoto-ign',
        extent: map.extent,
        source: wmsOthophotoSource,
    });
    const noDataValue = -1000;

    // Adds a WMS elevation layer
    const elevationSource = new TiledImageSource({
        source: new TileWMS({
            url: 'https://data.geopf.fr/wms-r',
            projection: 'EPSG:2154',
            crossOrigin: 'anonymous',
            params: {
                LAYERS: ['ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES'],
                FORMAT: 'image/x-bil;bits=32',
            },
        }),
        format: new BilFormat(),
        noDataValue,
    });

    const elevationLayer = new ElevationLayer({
        name: 'wms_elevation',
        extent: map.extent,
        resolutionFactor: 0.25,
        source: elevationSource,
    });

    map.addLayer(colorLayer);
    map.addLayer(elevationLayer);

    const box3 = new Box3();
    const center = map.extent.centerAsVector2();
    const boxCenter = new Vector3(center.x, center.y, 800);

    const volumeHelpers = new Group();
    instance.scene.add(volumeHelpers);

    /** @type {Box3Helper} */
    let helper;
    /** @type {Mesh} */
    let box;

    const helperMaterial = new MeshBasicMaterial({
        color: 'yellow',
        opacity: 0.1,
        transparent: true,
    });

    function generateBoxHelper() {
        box?.geometry?.dispose();
        box?.removeFromParent();
        helper?.dispose();
        helper?.removeFromParent();

        box3.setFromCenterAndSize(boxCenter, new Vector3(boxSize, boxSize, boxSize));
        const boxGeometry = new BoxGeometry(boxSize, boxSize, boxSize);
        box = new Mesh(boxGeometry, helperMaterial);
        helper = new Box3Helper(box3, 'yellow');
        box.renderOrder = 2;
        volumeHelpers.add(helper);
        volumeHelpers.add(box);
        box.position.copy(boxCenter);
        box.updateMatrixWorld();
        helper.updateMatrixWorld();
        volumeHelpers.updateMatrixWorld();
    }

    // refresh scene
    instance.notifyChange(instance.camera.camera3D);

    function bindToggle(id, action) {
        const toggle = document.getElementById(id);

        toggle.oninput = function oninput() {
            action(toggle.checked);
            instance.notifyChange();
        };
    }

    function update() {
        generateBoxHelper();
        planes = getPlanesFromBoxSides(box3);
        volumeHelpers.visible = options.showHelper && options.enableClippingPlanes;
        map.visible = options.showMap;
        pointCloud.visible = options.showPointCloud;
        map.clippingPlanes = options.enableClippingPlanes && options.applyOnMap ? planes : null;
        pointCloud.clippingPlanes =
            options.enableClippingPlanes && options.applyOnPointCloud ? planes : null;
        instance.notifyChange();
    }

    bindToggle('toggle-show-volume', v => {
        options.showHelper = v;
        update();
    });

    bindToggle('enable-clipping-planes', v => {
        options.enableClippingPlanes = v;
        update();
    });

    bindToggle('toggle-pointcloud', v => {
        options.applyOnPointCloud = v;
        update();
    });

    bindToggle('toggle-show-pointcloud', v => {
        options.showPointCloud = v;
        update();
    });

    bindToggle('toggle-show-map', v => {
        options.showMap = v;
        update();
    });

    bindToggle('toggle-map', v => {
        options.applyOnMap = v;
        update();
    });

    const slider = document.getElementById('slider-size');
    slider.oninput = function oninput() {
        boxSize = slider.value;
        update();
    };

    update();
}
instance.add(pointcloud).then(setupScene);

Inspector.attach(document.getElementById('panelDiv'), instance);

// configure camera
const lookAt = new Vector3(915833, 6455879, 121);
instance.camera.camera3D.position.set(909914, 6448629, 7925);
instance.camera.camera3D.lookAt(lookAt);
controls.target.copy(lookAt);
controls.saveState();

// Bind events
StatusBar.bind(instance);
