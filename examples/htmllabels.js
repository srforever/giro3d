import { GeoJSON } from 'ol/format.js';
import { Fill, Stroke, Style } from 'ol/style.js';
import TileWMS from 'ol/source/TileWMS.js';

import { MathUtils as THREEMath, Vector2, Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import VectorSource from '@giro3d/giro3d/sources/VectorSource.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';

import StatusBar from './widgets/StatusBar.js';

// This example is based on planar_vector example, adding labels on features.
// You can directly jump to `geoJsonLayer.source.addEventListener('featuresloadend', ...)`,
// as the rest is similar.

Instance.registerCRS(
    'EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);

const extent = new Extent('EPSG:3946', 1837816.94334, 1847692.32501, 5170036.4587, 5178412.82698);

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, { crs: extent.crs() });

const map = new Map('planar', { extent });
instance.add(map);

// Function to look at an extent from top
function lookTopDownAt(lookAtExtent, lookAtAltitude = 0) {
    const hFov = THREEMath.degToRad(instance.camera.camera3D.fov) / 2;

    const altitude =
        (Math.max(
            lookAtExtent.dimensions().x / instance.camera.camera3D.aspect,
            lookAtExtent.dimensions().y,
        ) /
            Math.tan(hFov)) *
        0.5;
    const position = lookAtExtent.centerAsVector3().add(new Vector3(0, 0, altitude));
    const lookAt = lookAtExtent.centerAsVector3();
    lookAt.z = lookAtAltitude;
    // place camera above
    instance.camera.camera3D.position.copy(position);
    // look down
    instance.camera.camera3D.lookAt(lookAt);
    // make sure the camera isn't rotating around its view axis
    instance.camera.camera3D.rotation.z = 0;
    instance.camera.camera3D.rotation.x = 0.01; // quickfix to avoid bizarre jumps

    instance.controls.target.copy(lookAt);
    instance.controls.saveState();
    instance.notifyChange(instance.camera.camera3D);
}

const wmsSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://data.geopf.fr/wms-r',
        projection: 'EPSG:3946',
        params: {
            LAYERS: ['HR.ORTHOIMAGERY.ORTHOPHOTOS'],
            FORMAT: 'image/jpeg',
        },
    }),
});

const colorLayer = new ColorLayer({
    name: 'wms_imagery',
    extent,
    source: wmsSource,
});
map.addLayer(colorLayer);

const style = new Style({
    fill: new Fill({
        color: 'rgba(255, 165, 0, 0.2)',
    }),
    stroke: new Stroke({
        color: 'white',
        width: 2,
    }),
});

const geojsonSource = new VectorSource({
    format: new GeoJSON(),
    data: 'https://raw.githubusercontent.com/iTowns/iTowns2-sample-data/master/lyon.geojson',
    style,
});

const geoJsonLayer = new ColorLayer({
    name: 'geojson',
    extent,
    source: geojsonSource,
});

map.addLayer(geoJsonLayer).then(() => {
    // Traverse the OpenLayers features that were added
    for (const feature of geojsonSource.getFeatures()) {
        // Create a label for each feature

        const text = document.createElement('div');
        // Virtually any inner markup is supported, here we're just inserting text
        text.innerText = feature.get('nom');
        text.title = `${feature.get('numero_arrondissement')}e arrondissement`;

        // Any CSS style is supported
        text.style.color = '#ffffff';
        text.style.padding = '0.2em 1em';
        text.style.maxWidth = '200px';
        text.style.border = '2px solid #cccccc';
        text.style.backgroundColor = '#080808';
        text.style.textAlign = 'center';
        text.style.opacity = 0.8;

        // Adding the label requires a Vector3 position, let's compute that
        // We'll position the label at the center of the geometry extent
        const olExtent = feature.getGeometry().getExtent();
        const giro3dExtent = new Extent(
            'EPSG:3946',
            olExtent[0],
            olExtent[2],
            olExtent[1],
            olExtent[3],
        );
        if (!giro3dExtent.isInside(extent)) {
            // The extent of the feature is not fully inside the map extent,
            // let's crop it to make sure the label will be inside the map
            giro3dExtent.intersect(extent);
        }
        const position = new Vector2();
        giro3dExtent.centerAsVector2(position);

        // Create our label and position it
        const label = new CSS2DObject(text);
        label.position.set(position.x, position.y, 0);
        label.updateMatrixWorld();
        // Give it a name so it shows up nicely in the inspector
        label.name = `${feature.get('nom')}`;
        // Simply add it to our instance
        // (we could also create a dedicated THREE.Group to have all the labels inside)
        instance.add(label);

        // By default, labels don't have mouse interaction enabled (pointerEvents = 'none')
        // Let's change that so we can click on it to zoom on it
        text.style.cursor = 'pointer';
        text.style.pointerEvents = 'auto';
        // Controls can interfer with the click event
        // e.g. this click event is triggered when we drag the map and the dragging ends on a label
        // but the mouseover is not, so use that to know if the user really wants to click
        // on the label.
        text.addEventListener('mouseover', () => {
            text._over = true;
        });
        text.addEventListener('mouseout', () => {
            text._over = false;
        });
        text.addEventListener('click', () => {
            if (text._over) lookTopDownAt(giro3dExtent);
        });
    }
    instance.notifyChange(geoJsonLayer);
});

instance.camera.camera3D.position.set(extent.west(), extent.south(), 2000);

const controls = new MapControls(instance.camera.camera3D, instance.domElement);
controls.target = extent.centerAsVector3();
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);
