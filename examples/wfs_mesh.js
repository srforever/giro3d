import { Color, CubeTextureLoader } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createXYZ } from 'ol/tilegrid.js';
import { tile } from 'ol/loadingstrategy.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import VectorSource from 'ol/source/Vector.js';
import TileWMS from 'ol/source/TileWMS.js';

import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import FeatureCollection from '@giro3d/giro3d/entities/FeatureCollection.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';

// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Define a geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3946',
    1837816.94334, 1847692.32501,
    5170036.4587, 5178412.82698,
);
// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Instantiate Giro3D
const instance = new Instance(viewerDiv, { crs: 'EPSG:3946' });

// Adds the map that will contain the layers.
const map = new Map('planar', { extent });
instance.add(map);

// Adds a WMS imagery layer
const olSource = new TileWMS({
    url: 'https://download.data.grandlyon.com/wms/grandlyon',
    projection: 'EPSG:3946',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['Ortho2018_Dalle_unique_8cm_CC46'],
    },
    version: '1.3.0',
});
const wmsSource = new TiledImageSource({ source: olSource });

const colorLayer = new ColorLayer(
    'wms_imagery',
    {
        source: wmsSource,
        updateStrategy: {
            options: {},
        },
    },
);
map.addLayer(colorLayer);

// define the source of our data
const busLinesSource = new VectorSource({
    format: new GeoJSON(),
    url: function url(tileExtent) {
        return (
            `${'https://download.data.grandlyon.com/wfs/rdata'
            + '?SERVICE=WFS'
            + '&VERSION=2.0.0'
            + '&request=GetFeature'
            + '&typename=tcl_sytral.tcllignebus_2_0_0'
            + '&outputFormat=application/json;%20subtype=geojson'
            + '&SRSNAME=EPSG:3946'
            + '&startIndex=0'
            + '&bbox='}${tileExtent.join(',')},EPSG:3946`
        );
    },
    strategy: tile(createXYZ({ tileSize: 512 })),
});

// Create the `FeatureCollection` entity that will load our features as meshes.
const busLines = new FeatureCollection('bus lines', {
    source: busLinesSource,
    extent,
    minLevel: 0,
    maxLevel: 0,
    altitude: 50,
    // we can modify the mesh through the `style` property
    style: feat => {
        const lineName = feat.getProperties().ligne;
        // color according to line name
        let color;
        if (lineName.startsWith('C')) {
            color = new Color('red');
        } else if (lineName.startsWith('S')) {
            color = new Color('yellow');
        } else {
            color = new Color('blue');
        }
        return { color };
    },
});

// Let's add our bus lines feature collection to the scene
instance.add(busLines);

// define another source
const busStopSource = new VectorSource({
    format: new GeoJSON(),
    url: function url(tileExtent) {
        return (
            `${'https://download.data.grandlyon.com/wfs/rdata'
            + '?SERVICE=WFS'
            + '&VERSION=2.0.0'
            + '&request=GetFeature'
            + '&typename=tcl_sytral.tclarret'
            + '&outputFormat=application/json; subtype=geojson'
            + '&SRSNAME=EPSG:3946'
            + '&bbox='}${tileExtent.join(',')},EPSG:3946`
        );
    },
    strategy: tile(createXYZ({ tileSize: 512 })),
});
// Create the `FeatureCollection` entity that will load our features as meshes.
const busStops = new FeatureCollection('bus stops', {
    source: busStopSource,
    extent,
    minLevel: 3,
    maxLevel: 3,
    altitude: 50,
    // we can use the `style` callback, but it's also possible to modify the resulting mesh directly
    // with the `onMeshCreated` option
    onMeshCreated: mesh => {
        mesh.material.size = 5;
        mesh.material.sizeAttenuation = false;
        mesh.material.color = new Color('#ffe44c');
    },
});
instance.add(busStops);

// add a skybox background, just to look nicer :-)
const cubeTextureLoader = new CubeTextureLoader();
cubeTextureLoader.setPath('image/skyboxsun25deg_zup/');
const cubeTexture = cubeTextureLoader.load([
    'px.jpg', 'nx.jpg',
    'py.jpg', 'ny.jpg',
    'pz.jpg', 'nz.jpg',
]);
instance.scene.background = cubeTexture;

// Place camera at the bottom left corner of the map
const cameraPosition = new Coordinates(
    'EPSG:3946',
    extent.west(), extent.south(), 10000,
).xyz();

instance.camera.camera3D.position.copy(cameraPosition);
// and look at the center of our extent
instance.camera.camera3D.lookAt(extent.center().xyz());
// we need to tell Giro3D we changed the camera position
instance.notifyChange(instance.camera.camera3D);

// Creates controls
const controls = new MapControls(
    instance.camera.camera3D,
    viewerDiv,
);

// MapControls needs a target, let's set it at our lookAt position
controls.target = extent.center().xyz();
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;

instance.useTHREEControls(controls);

// display labels
const text = document.createElement('div');
text.className = 'label';
// Any CSS style is supported
text.style.color = '#ffffff';
text.style.padding = '0.2em 1em';
text.style.maxWidth = '200px';
text.style.border = '2px solid #cccccc';
text.style.backgroundColor = '#080808';
text.style.textAlign = 'center';
text.style.opacity = 0.7;

const wrapper = document.createElement('div');
wrapper.style.marginTop = '2rem';
wrapper.appendChild(text);
// then wrap it in a CSS2DObject
const label = new CSS2DObject(wrapper);
instance.add(label);

instance.domElement.addEventListener('mousemove', e => {
    const picked = instance.pickObjectsAt(e, { radius: 2, limit: 1, where: [busStops, busLines] });
    if (picked.length === 0) {
        label.visible = false;
        instance.notifyChange(label);
    } else {
        const found = picked[0];
        const obj = found.object;
        if (found.layer === busStops) {
            text.innerText = `Bus stop "${obj.userData.properties.nom}"`;
        } else if (found.layer === busLines) {
            text.innerText = `Bus line ${obj.userData.properties.ligne}`;
        }
        // Virtually any inner markup is supported, here we're just inserting text
        label.name = text.innerText;
        // take the middle vertex as position
        label.position.set(found.point.x, found.point.y, found.point.z);
        label.updateMatrixWorld();
        label.visible = true;
        instance.notifyChange(label);
    }
});

Inspector.attach(document.getElementById('panelDiv'), instance);
