/*
 * This code uses the same one as the orthographic example; see that one for explanations.
 */

import { WebGLRenderer } from 'three';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stamen from 'ol/source/Stamen.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';

const extent = new Extent(
    'EPSG:3857',
    -20037508.342789244, 20037508.342789244,
    -20037508.342789244, 20037508.342789244,
);

const source = new TiledImageSource({ source: new Stamen({ layer: 'watercolor', wrapX: false }) });

function buildViewer(viewerDiv, defaultRenderer = true) {
    const renderer = { clearColor: false };
    if (!defaultRenderer) {
        renderer.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    }
    const instance = new Instance(viewerDiv, { renderer, crs: extent.crs() });
    // Creates a map that will contain the layer
    const map = new Map('planar', { extent, maxSubdivisionLevel: 10 });

    instance.add(map);

    // Adds an TMS imagery layer
    map.addLayer(new ColorLayer(
        'osm',
        {
            source,
        },
    )).catch(e => console.error(e));

    instance.camera.camera3D.position.set(0, 0, 25000000);

    const controls = new MapControls(instance.camera.camera3D, instance.domElement);

    instance.useTHREEControls(controls);

    // Disable zoom so it doesn't capture scrolling
    controls.enableZoom = false;
}

// Remove the pre-generated default HTML elements for this example
document.getElementById('viewerDiv').remove();
document.getElementById('panelDiv').remove();

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
