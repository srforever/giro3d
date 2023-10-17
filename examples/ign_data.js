import TileWMS from 'ol/source/TileWMS.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import VectorSource from 'ol/source/Vector.js';
import { createXYZ } from 'ol/tilegrid.js';
import { tile } from 'ol/loadingstrategy.js';

import Instance, { INSTANCE_EVENTS } from '@giro3d/giro3d/core/Instance.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
// NOTE: changing the imported name because we use the native `Map` object in this example.
import Giro3dMap from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import BilFormat from '@giro3d/giro3d/formats/BilFormat.js';
import FeatureCollection from '@giro3d/giro3d/entities/FeatureCollection.js';

import {
    Vector3,
    CubeTextureLoader,
    DirectionalLight,
    MeshLambertMaterial,
    AmbientLight,
    Mesh,
    Material,
    DoubleSide,
    SRGBColorSpace,
} from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import StatusBar from './widgets/StatusBar.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

const viewerDiv = document.getElementById('viewerDiv');
const instance = new Instance(viewerDiv, { crs: 'EPSG:2154' });

// create a map
const extent = new Extent('EPSG:2154', -111629.52, 1275028.84, 5976033.79, 7230161.64);
const map = new Giro3dMap('planar', {
    extent,
    hillshading: false,
    segments: 64,
    doubleSided: false,
});
instance.add(map);

// Create a WMS imagery layer
const wmsOthophotoSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://wxs.ign.fr/ortho/geoportail/r/wms',
        projection: 'EPSG:2154',
        params: {
            LAYERS: ['HR.ORTHOIMAGERY.ORTHOPHOTOS'],
            FORMAT: 'image/jpeg',
        },
    }),
});

const colorLayer = new ColorLayer(
    'orthophoto-ign',
    {
        extent: map.extent,
        source: wmsOthophotoSource,
    },
);
map.addLayer(colorLayer);

const noDataValue = -1000;

// Adds a WMS elevation layer
const elevationSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://wxs.ign.fr/altimetrie/geoportail/r/wms',
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

const elevationLayer = new ElevationLayer(
    'wms_elevation',
    {
        extent: map.extent,
        source: elevationSource,
        noDataValue,
    },
);
map.addLayer(elevationLayer);

const vectorSource = new VectorSource({
    format: new GeoJSON(),
    url: function url(bbox) {
        return (
            `${'https://wxs.ign.fr/topographie/geoportail/wfs'
            + '?SERVICE=WFS'
            + '&VERSION=2.0.0'
            + '&request=GetFeature'
            + '&typename=BDTOPO_V3:batiment'
            + '&outputFormat=application/json'
            + '&SRSNAME=EPSG:2154'
            + '&startIndex=0'
            + '&bbox='}${bbox.join(',')},EPSG:2154`
        );
    },
    strategy: tile(createXYZ({ tileSize: 512 })),
});

const feat = new FeatureCollection('buildings', {
    source: vectorSource,
    extent,
    material: new MeshLambertMaterial(),
    extrusionOffset: feature => {
        const hauteur = -feature.getProperties().hauteur;
        if (Number.isNaN(hauteur)) {
            return null;
        }
        return hauteur;
    },
    style: feature => {
        const properties = feature.getProperties();
        let color = '#FFFFFF';
        if (properties.usage_1 === 'Résidentiel') {
            color = '#9d9484';
        } else if (properties.usage_1 === 'Commercial et services') {
            color = '#b0ffa7';
        }
        return { color };
    },
    minLevel: 11,
    maxLevel: 11,
});
// In case we want to display transparent buildings, we have to make sure they render *after* the
// Map, so that you can see the map through them. Otherwise, we would see the skybox!
feat.renderOrder = 1;

instance.add(feat);

// also add some lights
const sun = new DirectionalLight('#ffffff', 1.4);
sun.position.set(1, 0, 1).normalize();
sun.updateMatrixWorld(true);
instance.scene.add(sun);

// We can look below the floor, so let's light also a bit there
const sun2 = new DirectionalLight('#ffffff', 0.5);
sun2.position.set(0, 1, 1);
sun2.updateMatrixWorld();
instance.scene.add(sun2);

// ambient
const ambientLight = new AmbientLight(0xffffff, 0.2);
instance.scene.add(ambientLight);

// place camera above grenoble
instance.camera.camera3D.position.set(913349.2364044407, 6456426.459171033, 1706.0108044011636);
// and look at the Bastille
const lookAt = new Vector3(913896, 6459191, 200);
instance.camera.camera3D.lookAt(lookAt);
// Notify giro3d we've changed the three.js camera position directly
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

// information on click
const resultTable = document.getElementById('results');

/** @type {Map<Mesh, Material>} */
const previouslyPickedObjects = new Map();

const pickedMaterial = new MeshLambertMaterial({ color: '#3581b8', side: DoubleSide });

function pick(e) {
    const pickedObjects = instance.pickObjectsAt(e, { radius: 2, where: [feat] });
    for (const [key, value] of previouslyPickedObjects) {
        // Reset material of previous objects
        key.material = value;
    }
    previouslyPickedObjects.clear();
    instance.notifyChange();

    if (pickedObjects.length > 0) {
        resultTable.innerHTML = '';
    }
    if (pickedObjects.length !== 0) {
        // let's remove duplicates, because picking can find one match per face for the same object
        const pickedMap = new Map();
        for (const p of pickedObjects) {
            pickedMap.set(p.object.userData.id, p.object);
            if (!previouslyPickedObjects.has(p.object)) {
                previouslyPickedObjects.set(p.object, p.object.material);
                p.object.material = pickedMaterial;
            }
        }
        for (const obj of pickedMap.values()) {
            const p = obj.userData.properties;
            let propertiesInfo = '';
            if (p) {
                propertiesInfo = `
                    <tr>
                        <td>nature</td>
                        <td>${p.nature}</td>
                    </tr>
                    <tr>
                        <td>Usage 1</td>
                        <td>${p.usage_1}</td>
                    </tr>
                    <tr>
                        <td>Usage 2</td>
                        <td>${p.usage_2 || 'Unspecified'}</td>
                    </tr>
                    <tr>
                        <td>number of floor</td>
                        <td>${p.nombre_d_etages || 'Unspecified'}</td>
                    </tr>
                `;
            }

            resultTable.innerHTML += `
            <table class="table">
                <thead>
                    <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Value</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>id</td>
                        <td>${obj.userData.id}</td>
                    </tr>
                    ${propertiesInfo}
                </tbody>
            </table>
        `;
        }
    }
}

instance.domElement.addEventListener('mousemove', pick);

// NOTE: let's not forget to clean our event when the entity is removed, otherwise the webglrenderer
// recreates everything when picking.
instance.addEventListener(INSTANCE_EVENTS.ENTITY_REMOVED, () => {
    if (instance.getObjects(obj => obj.id === feat.id).length === 0) {
        instance.domElement.removeEventListener('mousemove', pick);
    }
});

// Bind events
StatusBar.bind(instance);
