import { Color, MathUtils, Vector3 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { GeoJSON } from 'ol/format.js';
import {
    Circle, Fill, Stroke, Style,
} from 'ol/style.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import VectorSource from '@giro3d/giro3d/sources/VectorSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import StatusBar from './widgets/StatusBar.js';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = Extent.fromCenterAndSize('EPSG:3857', { x: 11393552, y: 44035 }, 1000000, 1000000);

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0xFFFFFF,
    },
});

// Instanciates camera
const center = extent.center(new Vector3());
instance.camera.camera3D.position.set(center.x, center.y - 1, 1000000);

// Creates controls
const controls = new MapControls(
    instance.camera.camera3D,
    viewerDiv,
);

// Then looks at extent's center
controls.target = center;
controls.saveState();

instance.useTHREEControls(controls);

const map = new Map('map', { extent });
instance.add(map);

// Creates a custom vector layer
const features = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [102.0, 0.5],
            },
            properties: {
                prop0: 'value0',
            },
        },
        {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [102.0, 0.0],
                    [103.0, 1.0],
                    [104.0, 0.0],
                    [105.0, 1.0],
                ],
            },
            properties: {
                prop0: 'value0',
                prop1: 0.0,
            },
        },
        {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [
                        [100.0, 0.0],
                        [101.0, 0.0],
                        [101.0, 1.0],
                        [100.0, 1.0],
                        [100.0, 0.0],
                    ],
                ],
            },
            properties: {
                prop0: 'value0',
                prop1: { this: 'that' },
            },
        },
    ],
};

const style = new Style({
    fill: new Fill({
        color: 'cyan',
    }),
    stroke: new Stroke({
        color: 'orange',
        width: 5,
    }),
    image: new Circle({
        radius: 20,
        fill: new Fill({
            color: 'orange',
        }),
        stroke: new Stroke({
            color: 'black',
            width: 5,
        }),
    }),
});

const source = new VectorSource({
    format: new GeoJSON(),
    data: features,
    dataProjection: 'EPSG:4326',
    style,
});

const layer = new ColorLayer({
    name: 'geojson',
    extent,
    source,
});

map.addLayer(layer);

StatusBar.bind(instance);

Inspector.attach(document.getElementById('panelDiv'), instance);

instance.notifyChange(map);

function bindSlider(id, fn) {
    const slider = document.getElementById(id);
    slider.oninput = function oninput() {
        fn(slider.value);
        layer.source.update();
    };
}

let currentStyle = style;

bindSlider('thicknessSlider', v => currentStyle.getStroke().setWidth(v));
bindSlider('iconScaleSlider', v => currentStyle.getImage().setRadius(v));
bindSlider('iconOpacitySlider', v => currentStyle.getImage().setOpacity(v));

const button = document.getElementById('changeStyleBtn');
button.onclick = () => {
    function randomColor() {
        const color = new Color(
            MathUtils.randFloat(0, 1),
            MathUtils.randFloat(0, 1),
            MathUtils.randFloat(0, 1),
        );

        return `#${color.getHexString()}`;
    }

    const newStyle = new Style({
        fill: new Fill({
            color: randomColor(),
        }),
        stroke: new Stroke({
            color: randomColor(),
            width: MathUtils.randInt(1, 20),
        }),
        image: new Circle({
            radius: 20,
            fill: new Fill({
                color: randomColor(),
            }),
            stroke: new Stroke({
                color: randomColor(),
                width: MathUtils.randInt(1, 10),
            }),
        }),
    });
    // Here we test that setStyle() takes the new style into account
    // and that the layer is repainted.
    source.setStyle(newStyle);
    currentStyle = newStyle;
};
