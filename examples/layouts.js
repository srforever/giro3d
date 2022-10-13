/*
 * This code uses the same one as the customtiledimage example; see that one for explanations.
 */

import { WebGLRenderer } from 'three';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '@giro3d/giro3d/Core/Geographic/Extent.js';
import Instance from '@giro3d/giro3d/Core/Instance.js';
import ColorLayer from '@giro3d/giro3d/Core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/Core/layer/ElevationLayer.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/Core/layer/LayerUpdateStrategy.js';
import Coordinates from '@giro3d/giro3d/Core/Geographic/Coordinates.js';
import { ELEVATION_FORMAT } from '@giro3d/giro3d/utils/DEMUtils.js';
import { Map } from '@giro3d/giro3d/entities/Map.js';
import CustomTiledImageSource from '@giro3d/giro3d/sources/CustomTiledImageSource.js';

Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

const extent = new Extent(
    'EPSG:2154',
    929748, 974519, 6400582, 6444926,
);

// Source data from IGN BD ALTI https://geoservices.ign.fr/bdalti
const demSource = new CustomTiledImageSource({
    url: 'https://3d.oslandia.com/ecrins/ecrins-dem.json',
    networkOptions: { crossOrigin: 'same-origin' },
});

// Source data from Copernicus https://land.copernicus.eu/imagery-in-situ/european-image-mosaics/very-high-resolution/vhr-2012
const imagerySource = new CustomTiledImageSource({
    url: 'https://3d.oslandia.com/ecrins/ecrins.json',
    networkOptions: { crossOrigin: 'same-origin' },
});

const cameraPosition = new Coordinates(
    'EPSG:2154',
    extent.west(), extent.south(), 2000,
).xyz();

function buildViewer(viewerDiv, defaultRenderer = true) {
    const renderer = { clearColor: false };
    if (!defaultRenderer) {
        renderer.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    }
    const instance = new Instance(viewerDiv, { renderer });

    const map = new Map('planar', { extent });
    instance.add(map);

    map.addLayer(new ElevationLayer('dem', {
        updateStrategy: {
            type: STRATEGY_DICHOTOMY,
            options: {},
        },
        source: demSource,
        elevationFormat: ELEVATION_FORMAT.HEIGHFIELD,
        heightFieldOffset: 711,
        heightFieldScale: 3574,
        projection: 'EPSG:2154',
    }));

    map.addLayer(new ColorLayer('copernicus', {
        updateStrategy: {
            type: STRATEGY_DICHOTOMY,
            options: {},
        },
        source: imagerySource,
        projection: 'EPSG:2154',
    }));

    instance.camera.camera3D.position.copy(cameraPosition);

    const controls = new MapControls(
        instance.camera.camera3D,
        viewerDiv,
    );

    controls.target = extent.center().xyz();
    controls.saveState();

    controls.enableDamping = true;
    controls.dampingFactor = 0.2;
    controls.maxPolarAngle = Math.PI / 2.3;

    instance.useTHREEControls(controls);

    // Disable zoom so it doesn't capture scrolling
    controls.enableZoom = false;
}

// Dynamically find all viewers we have to build
const viewerDivs = document.getElementsByClassName('viewer');
for (let i = 0; i < viewerDivs.length; i += 1) {
    buildViewer(viewerDivs[i]);
}

// Dynamically find all viewers we have to build with custom WebGLRenderers
const viewerCustomRendererDivs = document.getElementsByClassName('viewer-custom-renderer');
for (let i = 0; i < viewerCustomRendererDivs.length; i += 1) {
    buildViewer(viewerCustomRendererDivs[i], false);
}
