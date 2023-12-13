import GeoJSON from 'ol/format/GeoJSON.js';
import VectorSource from 'ol/source/Vector.js';
import { createXYZ } from 'ol/tilegrid.js';
import { tile } from 'ol/loadingstrategy.js';

import Instance, { INSTANCE_EVENTS } from '@giro3d/giro3d/core/Instance.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
// NOTE: changing the imported name because we use the native `Map` object in this example.
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import FeatureCollection from '@giro3d/giro3d/entities/FeatureCollection.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates';

import {
    Color,
    Vector3,
} from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import StatusBar from './widgets/StatusBar.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

const viewerDiv = document.getElementById('viewerDiv');
const extent = new Extent('EPSG:2154', -111629.52, 1275028.84, 5976033.79, 7230161.64);
const instance = new Instance(viewerDiv, { crs: extent.crs() });

// This is a geojson with the default crs EPSG:4326
const arrondissementSource = new VectorSource({
    format: new GeoJSON(),
    url: './data/paris_arrondissements.geojson',
});

// feat get automatically reprojected
const arrondissements = new FeatureCollection('arrondissements', {
    source: arrondissementSource,
    extent,
    minLevel: 0,
    maxLevel: 0,
    style: () => {
        const grayLevel = Math.random();
        return {
            color: new Color(grayLevel, grayLevel, grayLevel),
        };
    },
});
instance.add(arrondissements);

// another geojson in 3857 (openlayers, and thus giro3d, supports the non-official yet supported
// everywhere way of specifying the crs in the geojson file itself)
const perimeterqaaSource = new VectorSource({
    format: new GeoJSON(),
    url: './data/perimetreqaa.geojson',
});
const perimeterqaa = new FeatureCollection('perimeterqaa', {
    source: perimeterqaaSource,
    extent,
    minLevel: 0,
    maxLevel: 0,
    // this is necessary to avoid z-fighting, as both perimeterqaa and arrondissements are at z=0
    onMeshCreated: mesh => {
        // let's ignore depthTest to avoid z-fighting
        mesh.material.depthTest = false;
    },
    style: {
        color: '#41822d',
    },
});
perimeterqaa.renderOrder = 2;
instance.add(perimeterqaa);

// a WFS source in 3857
const bdTopoSource = new VectorSource({
    format: new GeoJSON(),
    url: function url(bbox) {
        return (
            `${'https://wxs.ign.fr/topographie/geoportail/wfs'
            + '?SERVICE=WFS'
            + '&VERSION=2.0.0'
            + '&request=GetFeature'
            + '&typename=BDTOPO_V3:batiment'
            + '&outputFormat=application/json'
            + '&SRSNAME=EPSG:3857'
            + '&startIndex=0'
            + '&bbox='}${bbox.join(',')},EPSG:3857`
        );
    },
    // this is necessary to avoid z-fighting
    onMeshCreated: mesh => {
        mesh.material.depthTest = false;
    },
    strategy: tile(createXYZ({ tileSize: 512 })),
});
const feat = new FeatureCollection('buildings', {
    source: bdTopoSource,
    // we specify that FeatureCollection should reproject the features before displaying them
    dataProjection: 'EPSG:3857',
    extent,
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
feat.renderOrder = 3;

instance.add(feat);

// place camera above paris
const position = new Coordinates('EPSG:2154', 652212.5, 6860754.1, 27717.3);
const lookAtCoords = new Coordinates('EPSG:2154', 652338.3, 6862087.1, 200);
const lookAt = new Vector3(lookAtCoords.x, lookAtCoords.y, lookAtCoords.z);
instance.camera.camera3D.position.set(position.x, position.y, position.z);
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

// information on click
const resultTable = document.getElementById('results');

function resetColor(o) {
    if (o.material && o.userData.oldColor) {
        o.material.color = o.userData.oldColor;
    }
}

function pick(e) {
    // first reset the colors
    arrondissements.object3d.traverse(resetColor);
    perimeterqaa.object3d.traverse(resetColor);
    instance.notifyChange();
    // pick objects
    const pickedObjects = instance.pickObjectsAt(
        e,
        { radius: 2, where: [arrondissements, perimeterqaa] },
    );

    if (pickedObjects.length !== 0) {
        resultTable.innerHTML = '';
        let arrondissementLabel = null;
        let accessibilityZoneLabel = '';
        for (const p of pickedObjects) {
            const obj = p.object;

            // init the oldColor the first time
            if (!obj.userData.oldColor) {
                obj.userData.oldColor = obj.material.color;
            }
            if (obj.userData.parentEntity === arrondissements) {
                arrondissementLabel = obj.userData.properties.l_ar;
            }
            if (obj.userData.parentEntity === perimeterqaa) {
                accessibilityZoneLabel = 'Improved Accessibility Zone';
            }
            // highlight it
            obj.material.color = obj.userData.oldColor.clone().multiplyScalar(0.6);
        }
        resultTable.innerHTML = `${arrondissementLabel}<br>${accessibilityZoneLabel}`;
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
Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
