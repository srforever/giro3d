import Stamen from 'ol/source/Stamen.js';
import Vector from 'ol/source/Vector.js';
import TileWMS from 'ol/source/TileWMS.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Fetcher from '../src/Provider/Fetcher.js';
import Extent from '../src/Core/Geographic/Extent.js';
import Instance from '../src/Core/Instance.js';
import ColorLayer from '../src/Core/layer/ColorLayer.js';
import { Map } from '../src/entities/Map.js';

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3857',
    -20037508.342789244, 20037508.342789244,
    -20037508.342789244, 20037508.342789244,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Creates a giro3d instance
const instance = new Instance(viewerDiv, { crs: extent.crs() });

// Instanciates camera
instance.camera.camera3D.position.set(0, 0, 10000000);

// Instanciates controls
const controls = new MapControls(
    instance.camera.camera3D,
    instance.domElement,
);
controls.enableDamping = true;
controls.dampingFactor = 0.25;

instance.useTHREEControls(controls);

// Creates a map that will contain layers
const map = new Map('planar', { extent, maxSubdivisionLevel: 15 });
instance.add(map);

// Adds a base layer
const stamenSource = new Stamen({ layer: 'toner', wrapX: false });

map.addLayer(new ColorLayer(
    'osm',
    {
        source: stamenSource,
    },
)).catch(e => console.error(e));

// Adds a WMS layer
const wmsSource = new TileWMS({
    url: 'https://ahocevar.com/geoserver/wms',
    params: { LAYERS: 'topp:states', TILED: true, TRANSPARENT: true },
    projection: 'EPSG:3857',
    crossOrigin: '*',
    serverType: 'geoserver',
    transition: 0,
    wrapX: false,
});

map.addLayer(new ColorLayer(
    'wms',
    {
        source: wmsSource,
    },
)).catch(e => console.error(e));

// Adds a vector layer
const format = new GeoJSON();
const vectorSource = new Vector({ });
Fetcher.json('https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/departements.geojson')
    .then(geojson => {
        const features = format.readFeatures(geojson, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
        });
        vectorSource.addFeatures(features);
    });

const departementLayer = new ColorLayer(
    'vec',
    {
        source: vectorSource,
    },
);

departementLayer.style = (Style, Fill, Stroke) => function _() {
    return new Style({
        stroke: new Stroke({
            color: 'cyan',
            width: 1,
        }),
    });
};

map.addLayer(departementLayer);
