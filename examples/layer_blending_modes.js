import { Color } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import { Stroke, Style } from 'ol/style.js';
import XYZ from 'ol/source/XYZ.js';
import GeoJSON from 'ol/format/GeoJSON.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import ColorLayer, { BlendingMode } from '@giro3d/giro3d/core/layer/ColorLayer.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import StaticImageSource from '@giro3d/giro3d/sources/StaticImageSource.js';
import VectorSource from '@giro3d/giro3d/sources/VectorSource.js';

import StatusBar from './widgets/StatusBar.js';
import { bindNumericalDropDown } from './widgets/bindNumericalDropDown.js';
import { bindButton } from './widgets/bindButton.js';
import { bindColorPicker } from './widgets/bindColorPicker.js';
import { bindToggle } from './widgets/bindToggle.js';

// Define the extent of the map in the web mercator projection.
const extent = Extent.WGS84;

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a Giro3D instance
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x0a3b59,
    },
});

// Creates a map that will contain the layer
const map = new Map('map', { extent, backgroundColor: 'blue' });

instance.add(map);

const key =
    'pk.eyJ1IjoidG11Z3VldCIsImEiOiJjbGJ4dTNkOW0wYWx4M25ybWZ5YnpicHV6In0.KhDJ7W5N3d1z3ArrsDjX_A';

// Adds a XYZ color layer with MapBox satellite tileset
const satellite = new ColorLayer({
    name: 'xyz_color',
    blendingMode: BlendingMode.None,
    source: new TiledImageSource({
        source: new XYZ({
            url: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.webp?access_token=${key}`,
            crossOrigin: 'anonymous',
        }),
    }),
});
map.addLayer(satellite);

const outlineStyle = new Style({
    stroke: new Stroke({ color: 'red', width: 2 }),
});

// Display the countries boundaries.
const vector = new ColorLayer({
    name: 'boundaries',
    blendingMode: BlendingMode.Normal,
    source: new VectorSource({
        format: new GeoJSON(),
        data: 'https://3d.oslandia.com/giro3d/vectors/countries.geojson',
        style: outlineStyle,
        dataProjection: 'EPSG:4326',
    }),
});

map.addLayer(vector).catch(e => console.error(e));

// Create a cloud coverage layer with an additive blending mode
const cloud = new ColorLayer({
    name: 'clouds',
    blendingMode: BlendingMode.Additive,
    source: new StaticImageSource({
        source: 'https://3d.oslandia.com/giro3d/images/cloud_cover.webp',
        extent: Extent.WGS84,
    }),
});

map.addLayer(cloud);

instance.camera.camera3D.position.set(0, 0, 230);

const controls = new MapControls(instance.camera.camera3D, instance.domElement);

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);
StatusBar.bind(instance);

const setMode = (layer, mode) => {
    layer.blendingMode = mode;
    instance.notifyChange(map);
};

const setBackground = bindColorPicker('color', v => {
    map.materialOptions.backgroundColor = new Color(v);
    instance.notifyChange(map);
});
const setCloudMode = bindNumericalDropDown('cloud', v => setMode(cloud, v));
const setVectorMode = bindNumericalDropDown('vector', v => setMode(vector, v));
const setSatelliteMode = bindNumericalDropDown('satellite', v => setMode(satellite, v));

const show = (layer, v) => {
    layer.visible = v;
    instance.notifyChange(layer);
};

const showClouds = bindToggle('show-cloud', v => show(cloud, v));
const showSatellite = bindToggle('show-satellite', v => show(satellite, v));
const showVector = bindToggle('show-vector', v => show(vector, v));
const showBackground = bindToggle('show-background', v => {
    map.materialOptions.backgroundOpacity = v ? 1 : 0;
    instance.notifyChange(map);
});

const reset = () => {
    setCloudMode(BlendingMode.Additive);
    setVectorMode(BlendingMode.Normal);
    setSatelliteMode(BlendingMode.None);

    showClouds(true);
    showVector(true);
    showSatellite(true);

    setBackground('blue');

    showBackground(true);
};

bindButton('reset', reset);

reset();
