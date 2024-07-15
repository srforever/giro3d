import { AxesHelper, MathUtils, Vector3 } from 'three';

import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import ColorLayer, { BlendingMode } from '@giro3d/giro3d/core/layer/ColorLayer.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import StaticImageSource from '@giro3d/giro3d/sources/StaticImageSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import MapboxTerrainFormat from '@giro3d/giro3d/formats/MapboxTerrainFormat.js';
import { ColorMap, ElevationLayer } from '@giro3d/giro3d/core/layer/index.js';
import Ellipsoid from '@giro3d/giro3d/core/geographic/Ellipsoid.js';
import GlobeControls from '@giro3d/giro3d/controls/GlobeControls.js';
import GlobeControlsInspector from '@giro3d/giro3d/gui/GlobeControlsInspector.js';
import Atmosphere from '@giro3d/giro3d/entities/Atmosphere.js';
import Sun from '@giro3d/giro3d/core/geographic/Sun.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';

import StatusBar from './widgets/StatusBar.js';

import { makeColorRamp } from './widgets/makeColorRamp.js';
import { bindToggle } from './widgets/bindToggle.js';
import { bindDropDown } from './widgets/bindDropDown.js';
import { bindButton } from './widgets/bindButton.js';
import { bindSlider } from './widgets/bindSlider.js';
import { bindDatePicker } from './widgets/bindDatePicker.js';

const tmpCoords = new Coordinates('EPSG:4326');

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a Giro3D instance
const instance = new Instance(viewerDiv, {
    crs: 'EPSG:4978',
    renderer: {
        clearColor: 'black',
    },
});

const map = new Map('globe', {
    hillshading: {
        enabled: true,
    },
    graticule: {
        enabled: true,
        color: 'black',
        xStep: 10, // In degrees
        yStep: 10, // In degrees
        xOffset: 0,
        yOffset: 0,
        opacity: 0.5,
        thickness: 0.5, // In degrees
    },
    backgroundColor: 'grey',
    extent: Extent.WGS84,
});

instance.add(map);

const mapboxApiKey =
    'pk.eyJ1IjoidG11Z3VldCIsImEiOiJjbGJ4dTNkOW0wYWx4M25ybWZ5YnpicHV6In0.KhDJ7W5N3d1z3ArrsDjX_A';

// Adds a XYZ color layer with MapBox satellite tileset
const satellite = new ColorLayer({
    name: 'satellite',
    source: new TiledImageSource({
        source: new XYZ({
            url: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.webp?access_token=${mapboxApiKey}`,
            projection: 'EPSG:3857',
            crossOrigin: 'anonymous',
        }),
    }),
});
map.addLayer(satellite).catch(e => console.error(e));

satellite.visible = false;

// Create the OpenStreetMap color layer using an OpenLayers source.
// See https://openlayers.org/en/latest/apidoc/module-ol_source_OSM-OSM.html
// for more informations.
const osm = new ColorLayer({
    name: 'osm',
    source: new TiledImageSource({ source: new OSM() }),
});

map.addLayer(osm).catch(e => console.error(e));

osm.visible = false;

const blueMarble = new ColorLayer({
    name: 'blueMarble',
    source: new StaticImageSource({
        source: 'https://3d.oslandia.com/giro3d/images/world.topo.bathy.200412.3x5400x2700.webp',
        extent: Extent.WGS84,
    }),
});

map.addLayer(blueMarble);

blueMarble.visible = false;

// Adds a XYZ elevation layer with MapBox terrain RGB tileset
const elevationLayer = new ElevationLayer({
    name: 'elevation',
    preloadImages: true,
    colorMap: new ColorMap(makeColorRamp('magma'), -1000, 5000),
    minmax: { min: -500, max: 8000 },
    resolutionFactor: 0.5,
    source: new TiledImageSource({
        retries: 0,
        format: new MapboxTerrainFormat(),
        source: new XYZ({
            url: `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${mapboxApiKey}`,
            projection: 'EPSG:3857',
        }),
    }),
});
map.addLayer(elevationLayer).catch(e => console.error(e));

const clouds = new ColorLayer({
    name: 'clouds',
    blendingMode: BlendingMode.Additive,
    source: new StaticImageSource({
        source: 'https://3d.oslandia.com/giro3d/images/cloud_cover.webp',
        extent: Extent.WGS84,
    }),
});

map.addLayer(clouds);

clouds.visible = true;

const axes = new AxesHelper(16_000_000);

axes.visible = false;

instance.threeObjects.add(axes);

axes.updateMatrixWorld(true);

// Geostationary orbit
instance.camera.camera3D.position.set(35_785_000 + Ellipsoid.WGS84.semiMajorAxis, 0, 0);
instance.camera.camera3D.lookAt(new Vector3(0, 0, 0));

const atmosphere = new Atmosphere('atmosphere');

instance.add(atmosphere);

const controls = new GlobeControls({ instance });

instance.useTHREEControls(controls);

const inspector = Inspector.attach(document.getElementById('panelDiv'), instance);
inspector.addPanel(new GlobeControlsInspector(inspector.gui, instance, controls));

// For now we disable URL update because it messes up the globe controls
StatusBar.bind(instance, { disableUrlUpdate: true });

const setGraticule = bindToggle('graticule', v => {
    map.materialOptions.graticule.enabled = v;
    instance.notifyChange(map);
});

const showHelpers = bindToggle('helpers', v => {
    axes.visible = v;
    map.materialOptions.showTileOutlines = v;
    controls.showHelpers = v;
    instance.notifyChange(map);
});

const setColorLayer = bindDropDown('colorLayer', v => {
    const showLayer = layer => {
        if (layer) {
            layer.visible = true;
        }
    };

    map.forEachLayer(layer => {
        layer.visible = false;
    });
    elevationLayer.visible = true;

    switch (v) {
        case 'osm':
            showLayer(osm);
            map.materialOptions.graticule.color = 'black';
            break;
        case 'blueMarble':
            showLayer(blueMarble);
            map.materialOptions.graticule.color = 'cyan';
            break;
        case 'satellite':
            showLayer(satellite);
            showLayer(clouds);
            map.materialOptions.graticule.color = 'cyan';
            break;
        case 'none':
            map.materialOptions.graticule.color = '#00ff1e';
            break;
    }

    instance.notifyChange(map);
});

setGraticule(map.materialOptions.graticule.enabled);

const setAtmosphere = bindDropDown('atmosphere', v => {
    switch (v) {
        case 'none':
            atmosphere.visible = false;
            break;
        case 'simple':
            atmosphere.visible = true;
            atmosphere.realistic = false;
            break;
        case 'realistic':
            atmosphere.visible = true;
            atmosphere.realistic = true;
            break;
    }

    instance.notifyChange(atmosphere);
});

function update() {
    const { x, y, z } = instance.camera.camera3D.position;
    let altitude = Ellipsoid.WGS84.toGeodetic(x, y, z).altitude;
    altitude = MathUtils.clamp(altitude, 2, +Infinity);

    instance.camera.minNearPlane = Math.min(10000, altitude / 5);

    // Let's adjust the graticule step and thickness so that
    // it more or less always look the same when altitude changes.
    if (map.materialOptions.graticule.enabled) {
        let step = 0;
        if (altitude > 10_000_000) {
            step = 10;
        } else if (altitude > 3_000_000) {
            step = 5;
        } else if (altitude > 1_000_000) {
            step = 2;
        } else if (altitude > 500_000) {
            step = 1;
        } else {
            step = 0.5;
        }

        const thickness = MathUtils.mapLinear(altitude, 200, 39_000_000, 0.002, 0.9);

        map.materialOptions.graticule.xStep = step;
        map.materialOptions.graticule.yStep = step;
        map.materialOptions.graticule.thickness = thickness;
    }

    // Let's make the clouds transparent when we zoom in.
    if (altitude > 7_000_000) {
        clouds.opacity = 1;
    } else if (altitude < 3_000_000) {
        clouds.opacity = 0;
    } else {
        clouds.opacity = MathUtils.mapLinear(altitude, 3_000_000, 7_000_000, 0, 1);
    }

    atmosphere.opacity = clouds.opacity;
}

update();

instance.addEventListener('after-camera-update', update);

const sun = {
    latitude: 0,
    longitude: 0,
};

const updateSunDirection = (latitude, longitude) => {
    const normal = Ellipsoid.WGS84.getNormal(sun.latitude, sun.longitude);

    // The direction is the opposite of the normal
    const direction = normal.negate();

    atmosphere.setSunDirection(direction);
    map.setSunDirection(direction);
};

const setSunLatitude = bindSlider('sunLatitude', v => {
    sun.latitude = v;
    updateSunDirection(sun.latitude, sun.longitude);
    document.getElementById('sunLatitudeLabel').innerText = `Sun latitude: ${Math.round(v)}°`;
});

const setSunLongitude = bindSlider('sunLongitude', v => {
    sun.longitude = v;
    updateSunDirection(sun.latitude, sun.longitude);
    document.getElementById('sunLongitudeLabel').innerText = `Sun longitude: ${Math.round(v)}°`;
});

const setLighting = bindToggle('lighting', v => {
    map.materialOptions.hillshading.enabled = v;
    instance.notifyChange(map);
});

function setSunPosition(date) {
    const sunPosition = Sun.getGeographicPosition(date, tmpCoords);

    setSunLongitude(sunPosition.longitude);
    setSunLatitude(sunPosition.latitude);
}

let date = new Date();

const setDate = bindDatePicker('date', date => {
    setSunPosition(date);
});

const setTime = bindSlider('time', seconds => {
    const h = seconds / 3600;
    const wholeH = Math.floor(h);

    const m = (h - wholeH) * 60;
    const wholeM = Math.floor(m);

    date.setUTCHours(wholeH, wholeM);

    setSunPosition(date);

    document.getElementById('timeLabel').innerText =
        `${wholeH.toString().padStart(2, '0')}:${wholeM.toString().padStart(2, '0')} UTC`;
});

const setCurrentDate = date => {
    setSunPosition(date);
    setDate(date);
    setTime(date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds());
};

bindButton('now', () => {
    date = new Date();
    setCurrentDate(date);
});

const setSunPositionMode = bindDropDown('sun-position-mode', v => {
    const datePicker = document.getElementById('date-picker');
    const locationPicker = document.getElementById('sun-location');
    const timeSlider = document.getElementById('timeContainer');

    datePicker.style.display = 'none';
    locationPicker.style.display = 'none';
    timeSlider.style.display = 'none';

    switch (v) {
        case 'current-date':
            setCurrentDate(new Date());
            break;
        case 'custom-date':
            datePicker.style.display = 'block';
            timeSlider.style.display = 'block';
            break;
        case 'custom-location':
            locationPicker.style.display = 'block';
            break;
    }
});

const reset = () => {
    setColorLayer('satellite');
    setAtmosphere('realistic');
    setGraticule(false);
    showHelpers(false);
    setSunLatitude(35);
    setSunLongitude(-45);
    setLighting(true);
    setDate(new Date());
    setSunPositionMode('current-date');
};

bindButton('reset', reset);

reset();
