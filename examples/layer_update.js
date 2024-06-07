import { Color, MathUtils } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import { Feature } from 'ol';
import { LineString, Point, Polygon } from 'ol/geom.js';
import { Circle, Fill, Stroke, Style } from 'ol/style.js';

import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import VectorSource from '@giro3d/giro3d/sources/VectorSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

import StatusBar from './widgets/StatusBar.js';

import { bindButton } from './widgets/bindButton.js';
import { bindToggle } from './widgets/bindToggle.js';
import { bindSlider } from './widgets/bindSlider.js';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = Extent.fromCenterAndSize('EPSG:3857', { x: 11393552, y: 44035 }, 1000000, 500000);

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a Giro3D instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0xffffff,
    },
});

// Instanciates camera
const center = extent.centerAsVector3();
instance.camera.camera3D.position.set(center.x, center.y - 1, 1000000);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, viewerDiv);

// Then looks at extent's center
controls.target = center;
controls.saveState();

instance.useTHREEControls(controls);

const map = new Map('map', { extent });
instance.add(map);

const fillColor = new Color('orange');
const strokeColor = new Color('red');

const image = new Circle({
    radius: 20,
    fill: new Fill({
        color: `#${fillColor.getHexString()}`,
    }),
    stroke: new Stroke({
        color: `#${strokeColor.getHexString()}`,
        width: 5,
    }),
});

const fill = new Fill({
    color: `#${fillColor.getHexString()}`,
});

const stroke = new Stroke({
    color: `#${strokeColor.getHexString()}`,
    width: 5,
});

let style = new Style({
    fill,
    stroke,
    image,
});

const polygon = new Feature(
    new Polygon([
        [
            [100.0, 0.0],
            [101.0, 0.0],
            [101.0, 1.0],
            [100.0, 1.0],
            [100.0, 0.0],
        ],
    ]).transform('EPSG:4326', 'EPSG:3857'),
);

const line = new Feature(
    new LineString([
        [102.0, 0.0],
        [103.0, 1.0],
        [104.0, 0.0],
        [105.0, 1.0],
    ]).transform('EPSG:4326', 'EPSG:3857'),
);

const point = new Feature(new Point([102.0, 0.5]).transform('EPSG:4326', 'EPSG:3857'));

const source = new VectorSource({
    data: [],
    dataProjection: 'EPSG:3857',
    style,
});

const layer = new ColorLayer({ source });

map.addLayer(layer);

StatusBar.bind(instance);

Inspector.attach(document.getElementById('panelDiv'), instance);

instance.notifyChange(map);

source.source.addFeatures([point, line, polygon]);

const setStrokeWidth = bindSlider('stroke-width', v => {
    style.getStroke().setWidth(v);
    style.getImage().getStroke().setWidth(v);
    style.getImage().setRadius(style.getImage().getRadius());
    layer.source.update();
});
const setPointRadius = bindSlider('point-radius', v => {
    style.getImage().setRadius(v);
    style.setImage(style.getImage());
    layer.source.update();
});
const setOpacity = bindSlider('style-opacity', v => {
    style
        .getImage()
        .getStroke()
        .setColor(
            `rgba(${strokeColor.r * 255}, ${strokeColor.g * 255}, ${strokeColor.b * 255}, ${v})`,
        );
    style
        .getImage()
        .getFill()
        .setColor(`rgba(${fillColor.r * 255}, ${fillColor.g * 255}, ${fillColor.b * 255}, ${v})`);
    style
        .getStroke()
        .setColor(
            `rgba(${strokeColor.r * 255}, ${strokeColor.g * 255}, ${strokeColor.b * 255}, ${v})`,
        );
    style
        .getFill()
        .setColor(`rgba(${fillColor.r * 255}, ${fillColor.g * 255}, ${fillColor.b * 255}, ${v})`);

    style.getImage().setRadius(style.getImage().getRadius());

    layer.source.update();
});

bindToggle('show-line', v => {
    if (v) {
        source.source.addFeature(line);
    } else {
        source.source.removeFeature(line);
    }
    source.update();
});
bindToggle('show-polygon', v => {
    if (v) {
        source.source.addFeature(polygon);
    } else {
        source.source.removeFeature(polygon);
    }
    source.update();
});
bindToggle('show-point', v => {
    if (v) {
        source.source.addFeature(point);
    } else {
        source.source.removeFeature(point);
    }
    source.update();
});

bindButton('randomize', () => {
    strokeColor.r = MathUtils.randFloat(0, 1);
    strokeColor.g = MathUtils.randFloat(0, 1);
    strokeColor.b = MathUtils.randFloat(0, 1);

    fillColor.r = MathUtils.randFloat(0, 1);
    fillColor.g = MathUtils.randFloat(0, 1);
    fillColor.b = MathUtils.randFloat(0, 1);

    const pointRadius = MathUtils.randFloat(0.1, 20);
    const strokeWidth = MathUtils.randFloat(1, 20);
    const opacity = MathUtils.randFloat(0, 1);

    const newStyle = new Style({
        fill: new Fill({
            color: `rgba(${fillColor.r * 255}, ${fillColor.g * 255}, ${fillColor.b * 255}, ${opacity})`,
        }),
        stroke: new Stroke({
            color: `rgba(${strokeColor.r * 255}, ${strokeColor.g * 255}, ${strokeColor.b * 255}, ${opacity})`,
            width: strokeWidth,
        }),
        image: new Circle({
            radius: pointRadius,
            fill: new Fill({
                color: `rgba(${fillColor.r * 255}, ${fillColor.g * 255}, ${fillColor.b * 255}, ${opacity})`,
            }),
            stroke: new Stroke({
                color: `rgba(${strokeColor.r * 255}, ${strokeColor.g * 255}, ${strokeColor.b * 255}, ${opacity})`,
                width: strokeWidth,
            }),
        }),
    });

    setPointRadius(pointRadius);
    setStrokeWidth(strokeWidth);
    setOpacity(opacity);

    style = newStyle;

    // Here we test that setStyle() takes the new style into account
    // and that the layer is repainted.
    source.setStyle(newStyle);
});
