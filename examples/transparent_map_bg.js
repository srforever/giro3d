import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Vector from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import { Vector3 } from 'three';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    -4553934 - 1000000, -4553934 + 1000000,
    -3910697 - 1000000, -3910697 + 1000000,
);

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: false,
    },
});

// Instanciates camera
instance.camera.camera3D.position.set(-4553934, -3910697, 4600000);

// Instanciates controls
const controls = new MapControls(
    instance.camera.camera3D,
    instance.domElement,
);
controls.target = new Vector3(-4553934, -3910696, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.25;

instance.useTHREEControls(controls);

const map = new Map('map', { extent, backgroundColor: 'green' });
instance.add(map);

const rectangle = new GeoJSON({ featureProjection: 'EPSG:3857' }).readFeature({
    type: 'Feature',
    geometry: {
        type: 'Polygon',
        coordinates: [
            [
                [-46, -30],
                [-41, -30],
                [-41, -35],
                [-46, -35],
                [-46, -30],
            ],
        ],
    },
});

const triangle = new GeoJSON({ featureProjection: 'EPSG:3857' }).readFeature({
    type: 'Feature',
    geometry: {
        type: 'Polygon',
        coordinates: [
            [
                [-45, -31],
                [-39, -31],
                [-39, -35],
                [-45, -31],
            ],
        ],
    },
});

const redSquare = new ColorLayer('redSquare', { source: new Vector({}) });
redSquare.source.addFeatures([rectangle]);
redSquare.style = (Style, Fill) => () => new Style({
    fill: new Fill({
        color: '#aa0000',
    }),
});

const blueTriangle = new ColorLayer('blueTriangle', { source: new Vector({}) });
blueTriangle.source.addFeatures([triangle]);
blueTriangle.style = (Style, Fill) => () => new Style({
    fill: new Fill({
        color: '#0000aa',
    }),
});

map.addLayer(redSquare);
map.addLayer(blueTriangle);

Inspector.attach(document.getElementById('panelDiv'), instance);

instance.notifyChange(map);

// GUI
function bindSlider(id, action) {
    const slider = document.getElementById(id);
    slider.oninput = () => {
        action(slider.value);
        instance.notifyChange(map);
    };
}

bindSlider('map-opacity', v => { map.opacity = v; });
bindSlider('bg-opacity', v => { map.materialOptions.backgroundOpacity = v; });
bindSlider('blue-opacity', v => { blueTriangle.opacity = v; });
bindSlider('red-opacity', v => { redSquare.opacity = v; });
