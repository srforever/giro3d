import XYZ from 'ol/source/XYZ.js';
import {
    Stroke, Style,
} from 'ol/style.js';
import { GeoJSON } from 'ol/format.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import VectorSource from '@giro3d/giro3d/sources/VectorSource.js';
import CogSource from '@giro3d/giro3d/sources/CogSource.js';
import { crsToUnit } from '@giro3d/giro3d/core/geographic/Coordinates.js';
import StatusBar from './widgets/StatusBar.js';

/** @type {Instance} */
let instance;
/** @type {Inspector} */
let inspector;
/** @type {MapControls} */
let controls;
/** @type {Map} */
let map;

function addMapboxLayer(extent) {
    const apiKey = 'pk.eyJ1IjoidG11Z3VldCIsImEiOiJjbGJ4dTNkOW0wYWx4M25ybWZ5YnpicHV6In0.KhDJ7W5N3d1z3ArrsDjX_A';

    // Adds a satellite basemap
    const tiledLayer = new ColorLayer(
        'basemap',
        {
            extent,
            showTileBorders: true,
            source: new TiledImageSource({
                source: new XYZ({
                    url: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.webp?access_token=${apiKey}`,
                    projection: 'EPSG:3857',
                    crossOrigin: 'anonymous',
                }),
            }),
        },
    );
    map.addLayer(tiledLayer).catch(e => console.error(e));
}

function addCogLayer() {
    const cogLayer = new ColorLayer('cog', {
        showTileBorders: true,
        source: new CogSource({
            url: 'https://s2downloads.eox.at/demo/Sentinel-2/3857/TCI.tif',
            crs: 'EPSG:3857',
        }),
    });
    map.addLayer(cogLayer).catch(e => console.error(e));
}

function addVectorLayer() {
    const outlineStyle = new Style({
        stroke: new Stroke({ color: 'red', width: 2 }),
    });

    // Display the countries boundaries.
    const boundaries = new ColorLayer('Boundaries', {
        source: new VectorSource({
            format: new GeoJSON(),
            data: 'https://3d.oslandia.com/giro3d/vectors/countries.geojson',
            style: outlineStyle,
            dataProjection: 'EPSG:4326',
        }),
    });

    map.addLayer(boundaries).catch(e => console.error(e));
}

function createScene(crs, crsDef, extent) {
    if (instance) {
        map.getLayers().forEach(l => l.dispose());
        controls.dispose();
        inspector.detach();
        instance.dispose();
    }

    Instance.registerCRS(crs, crsDef);

    // `viewerDiv` will contain giro3d' rendering area (the canvas element)
    const viewerDiv = document.getElementById('viewerDiv');

    // Creates a giro3d instance
    instance = new Instance(viewerDiv, { crs, renderer: { clearColor: 'grey' } });

    // Adds the map that will contain the layers.
    map = new Map('map', { extent, segments: 128, hillshading: true });

    instance.add(map);

    // Add a bunch of layers
    addMapboxLayer(extent);

    addCogLayer();

    addVectorLayer();

    // Sets the camera position
    const center = extent.center();
    instance.camera.camera3D.position.set(center.x(), center.y() - 1, extent.dimensions().y * 2);

    // Creates controls
    controls = new MapControls(
        instance.camera.camera3D,
        viewerDiv,
    );

    // Then looks at extent's center
    controls.target = extent.center().xyz();
    controls.saveState();

    controls.enableDamping = true;
    controls.dampingFactor = 0.2;
    controls.maxPolarAngle = Math.PI / 2.3;

    instance.useTHREEControls(controls);

    inspector = Inspector.attach(document.getElementById('panelDiv'), instance);

    StatusBar.bind(instance, { disableUrlUpdate: true });
}

async function fetchCrsBbox(crs) {
    const code = crs.split(':')[1];
    const url = `https://epsg.io/${code}.json?download=1`;
    const res = await fetch(url, { mode: 'cors' });
    const json = await res.json();

    const bbox = json.bbox;
    const south = Number.parseFloat(bbox.south_latitude);
    const north = Number.parseFloat(bbox.north_latitude);
    const west = Number.parseFloat(bbox.west_longitude);
    const east = Number.parseFloat(bbox.east_longitude);

    const wgs84Extent = new Extent('EPSG:4326', {
        west, east, north, south,
    });

    document.getElementById('currentCrsCode').innerText = crs;
    document.getElementById('currentCrsName').innerText = json.name;
    document.getElementById('currentCrsArea').innerText = json.area;

    if (crsToUnit(crs) === undefined) {
        // Unsupported projection
        throw new Error('unsupported projection (invalid units)');
    } else {
        return wgs84Extent.as(crs);
    }
}

async function fetchCrsDefinition(crs) {
    const code = crs.split(':')[1];
    const url = `https://epsg.io/${code}.proj4?download=1`;
    const res = await fetch(url, { mode: 'cors' });
    const def = await res.text();

    Instance.registerCRS(crs, def);

    return def;
}

async function initialize(crs) {
    try {
        const def = await fetchCrsDefinition(crs);
        const extent = await fetchCrsBbox(crs);
        const proj = crs;
        const error = document.getElementById('errorMessage');
        error.style.display = 'none';

        createScene(proj, def, extent);
    } catch (e) {
        const msg = e.message;
        const error = document.getElementById('errorMessage');
        error.innerText = msg;
        error.style.display = 'block';
    }
}

/** @type {HTMLButtonElement} */
const button = document.getElementById('createSceneBtn');

button.onclick = () => {
    /** @type {HTMLInputElement} */
    const epsgCodeElt = document.getElementById('epsgCode');

    const content = epsgCodeElt.value;

    if (content) {
        initialize(content);
    }
};

initialize('EPSG:2154');
