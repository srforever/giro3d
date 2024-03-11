import {
    Vector3,
    CubeTextureLoader,
    DirectionalLight,
    MeshLambertMaterial,
    AmbientLight,
    Mesh,
    Material,
    DoubleSide,
    Fog,
    Color,
    MathUtils,
} from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import VectorSource from 'ol/source/Vector.js';
import { createXYZ } from 'ol/tilegrid.js';
import { tile } from 'ol/loadingstrategy.js';
import { DefaultPersistentCache } from '@giro3d/giro3d/core/PersistentCache.js';

import Instance from '@giro3d/giro3d/core/Instance.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import WmtsSource from '@giro3d/giro3d/sources/WmtsSource.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
// NOTE: changing the imported name because we use the native `Map` object in this example.
import Giro3dMap from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import BilFormat from '@giro3d/giro3d/formats/BilFormat.js';
import FeatureCollection from '@giro3d/giro3d/entities/FeatureCollection.js';

import StatusBar from './widgets/StatusBar.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
Instance.registerCRS('IGNF:WGS84G', 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]');

const SKY_COLOR = new Color(0xf1e9c6);
const viewerDiv = document.getElementById('viewerDiv');
const instance = new Instance(viewerDiv, { crs: 'EPSG:2154', renderer: { clearColor: SKY_COLOR } });

// create a map
const extent = new Extent('EPSG:2154', -111629.52, 1275028.84, 5976033.79, 7230161.64);
const map = new Giro3dMap('planar', {
    extent,
    backgroundColor: 'gray',
    hillshading: {
        enabled: true,
        elevationLayersOnly: true,
    },
    segments: 64,
    discardNoData: true,
    doubleSided: false,
});
instance.add(map);

const noDataValue = -1000;

const capabilitiesUrl = 'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities';

WmtsSource
    .fromCapabilities(capabilitiesUrl, {
        layer: 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES',
        format: new BilFormat(),
        persistentCache: DefaultPersistentCache,
        noDataValue,
    })
    .then(elevationWmts => {
        map.addLayer(new ElevationLayer({
            name: 'wmts_elevation',
            extent: map.extent,
            // We don't need the full resolution of terrain because we are not using any shading
            resolutionFactor: 0.25,
            minmax: { min: 0, max: 5000 },
            noDataOptions: {
                replaceNoData: false,
            },
            source: elevationWmts,
        }));
    })
    .catch(console.error);

WmtsSource
    .fromCapabilities(capabilitiesUrl, {
        layer: 'HR.ORTHOIMAGERY.ORTHOPHOTOS',
        persistentCache: DefaultPersistentCache,
    })
    .then(orthophotoWmts => {
        map.addLayer(new ColorLayer({
            name: 'wmts_orthophotos',
            extent: map.extent,
            source: orthophotoWmts,
        }));
    })
    .catch(console.error);

const vectorSource = new VectorSource({
    format: new GeoJSON(),
    url: function url(bbox) {
        return (
            `${'https://data.geopf.fr/wfs/ows'
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
            color = '#cec8be';
        } else if (properties.usage_1 === 'Commercial et services') {
            color = '#d8ffd4';
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
// Notify Giro3D we've changed the three.js camera position directly
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
instance.addEventListener('entity-removed', () => {
    if (instance.getObjects(obj => obj.id === feat.id).length === 0) {
        instance.domElement.removeEventListener('mousemove', pick);
    }
});

const DOWN_VECTOR = new Vector3(0, 0, -1);
const EARTH_RADIUS = 6_3781_000;
const tmpVec3 = new Vector3();

const fog = new Fog(SKY_COLOR, 1, 2);
instance.scene.fog = fog;

function processFogAndClippingPlanes(camera) {
    // Compute the tilt, in radians, of the camera.
    const tilt = DOWN_VECTOR.angleTo(camera.camera3D.getWorldDirection(tmpVec3));

    const altitude = camera.camera3D.position.z;

    const maxFarPlane = 9_999_999;
    const actualTilt = MathUtils.clamp(tilt, 0, Math.PI / 3);
    const horizon = Math.sqrt(2 * altitude * EARTH_RADIUS) * 0.2;

    camera.maxFarPlane = MathUtils.mapLinear(actualTilt, 0, Math.PI / 3, maxFarPlane, horizon);
    fog.far = camera.far;
    fog.near = MathUtils.lerp(camera.near, camera.far, 0.2);
}

instance.addEventListener('after-camera-update', event => processFogAndClippingPlanes(event.camera));

processFogAndClippingPlanes(instance.camera);

// Bind events
StatusBar.bind(instance);
