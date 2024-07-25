import GeoJSON from 'ol/format/GeoJSON.js';
import VectorSource from 'ol/source/Vector.js';
import { createXYZ } from 'ol/tilegrid.js';
import { tile } from 'ol/loadingstrategy.js';

import { Color, Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import Instance from '@giro3d/giro3d/core/Instance.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import FeatureCollection from '@giro3d/giro3d/entities/FeatureCollection.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates';

import StatusBar from './widgets/StatusBar.js';
import { MathUtils } from 'three/src/math/MathUtils.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS(
    'EPSG:2154',
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
);

const viewerDiv = document.getElementById('viewerDiv');
const extent = new Extent('EPSG:2154', -111629.52, 1275028.84, 5976033.79, 7230161.64);
const instance = new Instance(viewerDiv, { crs: extent.crs() });

// This is a geojson with the default crs EPSG:4326
const arrondissementSource = new VectorSource({
    format: new GeoJSON(),
    url: './data/paris_arrondissements.geojson',
});

function getHue(area) {
    const minArea = 991153;
    const maxArea = 16372542;
    const hue = MathUtils.mapLinear(area, minArea, maxArea, 0.2, 0.8);

    return MathUtils.clamp(hue, 0, 1);
}

// feat get automatically reprojected
const arrondissements = new FeatureCollection('arrondissements', {
    source: arrondissementSource,
    extent,
    ignoreZ: true,
    minLevel: 0,
    maxLevel: 0,
    style: feature => {
        // The style depends on the polygon's area
        const t = getHue(feature.get('surface'));
        const highlight = feature.get('highlight');
        const brightness = highlight ? 1 : 0.7;
        const color = new Color().setHSL(0, t, brightness * t, 'srgb');

        return {
            fill: {
                color,
                depthTest: false,
                renderOrder: 1,
            },
            stroke: highlight
                ? {
                      color: 'white',
                      depthTest: false,
                      renderOrder: 2,
                  }
                : null,
        };
    },
});
instance.add(arrondissements);

// another geojson in 3857 (openlayers, and thus Giro3D, supports the non-official yet supported
// everywhere way of specifying the crs in the geojson file itself)
const perimeterqaaSource = new VectorSource({
    format: new GeoJSON(),
    url: './data/perimetreqaa.geojson',
});
const perimeterqaa = new FeatureCollection('perimeterqaa', {
    source: perimeterqaaSource,
    extent,
    ignoreZ: true,
    minLevel: 0,
    maxLevel: 0,
    style: feature => {
        const highlight = feature.get('highlight');
        return {
            fill: {
                color: highlight ? '#5d914d' : '#41822d',
                depthTest: false,
                opacity: 0.7,
                renderOrder: 3,
            },
            stroke: {
                color: '#85f516',
                lineWidth: highlight ? 4 : 1,
                depthTest: false,
                renderOrder: 4,
            },
        };
    },
});
instance.add(perimeterqaa);

// a WFS source in 3857
const bdTopoSource = new VectorSource({
    format: new GeoJSON(),
    url: function url(bbox) {
        return `${
            'https://data.geopf.fr/wfs/ows' +
            '?SERVICE=WFS' +
            '&VERSION=2.0.0' +
            '&request=GetFeature' +
            '&typename=BDTOPO_V3:batiment' +
            '&outputFormat=application/json' +
            '&SRSNAME=EPSG:3857' +
            '&startIndex=0' +
            '&bbox='
        }${bbox.join(',')},EPSG:3857`;
    },
    strategy: tile(createXYZ({ tileSize: 512 })),
});
const feat = new FeatureCollection('buildings', {
    source: bdTopoSource,
    // we specify that FeatureCollection should reproject the features before displaying them
    dataProjection: 'EPSG:3857',
    // We are working on a flat, 2D scene, so we must ignore the Z coordinate of features, if any.
    ignoreZ: true,
    extent,
    style: feature => {
        const properties = feature.getProperties();
        const highlighted = properties.highlight;
        let color = '#FFFFFF';

        if (highlighted) {
            color = 'cyan';
        } else {
            if (properties.usage_1 === 'Résidentiel') {
                color = '#9d9484';
            } else if (properties.usage_1 === 'Commercial et services') {
                color = '#b0ffa7';
            }
        }
        return {
            fill: {
                color,
                depthTest: false,
                renderOrder: 5,
            },
            stroke: {
                color: 'black',
                renderOrder: 6,
                depthTest: false,
            },
        };
    },
    minLevel: 11,
    maxLevel: 11,
});

instance.add(feat);

// place camera above paris
const position = new Coordinates('EPSG:2154', 652212.5, 6860754.1, 27717.3);
const lookAtCoords = new Coordinates('EPSG:2154', 652338.3, 6862087.1, 200);
const lookAt = new Vector3(lookAtCoords.x, lookAtCoords.y, lookAtCoords.z);
instance.camera.camera3D.position.set(position.x, position.y, position.z);
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

// information on click
const resultTable = document.getElementById('results');

let previousObjects = [];
const objectsToUpdate = [];

function createResultTable(values) {
    resultTable.innerHTML = '';

    for (const value of values) {
        const child = document.createElement('li');
        // child.classList.add('list-group-item');
        child.innerText = value;
        resultTable.appendChild(child);
    }
}

function pick(e) {
    instance.notifyChange();
    // pick objects
    const pickedObjects = instance.pickObjectsAt(e, {
        radius: 2,
        where: [arrondissements, perimeterqaa],
    });

    // Reset highlights
    previousObjects.forEach(o => o.userData.feature.set('highlight', false));

    const tableValues = [];

    if (pickedObjects.length !== 0) {
        resultTable.innerHTML = '';

        for (const p of pickedObjects) {
            const obj = p.object;

            const feature = obj.userData.feature;
            const entity = obj.userData.parentEntity;

            objectsToUpdate.push(obj);

            if (entity === arrondissements) {
                tableValues.push(feature.get('l_ar'));
            }
            if (entity === perimeterqaa) {
                tableValues.push('Improved Accessibility Zone');
            }
            // highlight it
            feature.set('highlight', true);
        }
    }

    createResultTable(tableValues);

    instance.notifyChange([...previousObjects, ...objectsToUpdate]);
    previousObjects = [...objectsToUpdate];
    objectsToUpdate.length = 0;
}

instance.domElement.addEventListener('mousemove', pick);

// Bind events
Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
