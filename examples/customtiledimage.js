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
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import { Collection, Feature } from 'ol';
import VectorSource from 'ol/source/Vector.js';
import { LineString } from 'ol/geom.js';

Instance.registerCRS('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

const extent = new Extent(
    'EPSG:2154',
    929748, 974519, 6400582, 6444926,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the giro3d instance
const instance = new Instance(viewerDiv);

// Adds the map that will contain the layers.
const map = new Map('planar', { extent });
instance.add(map);

// Adds our Elevation source & layer
// Source data from IGN BD ALTI https://geoservices.ign.fr/bdalti
const demSource = new CustomTiledImageSource({
    url: 'https://3d.oslandia.com/ecrins/ecrins-dem.json',
    networkOptions: { crossOrigin: 'same-origin' },
});
map.addLayer(new ElevationLayer('dem', {
    updateStrategy: {
        type: STRATEGY_DICHOTOMY,
        options: {},
    },
    source: demSource,
    elevationFormat: ELEVATION_FORMAT.HEIGHFIELD,
    heightFieldOffset: 711, // Altitude corresponding to 0 in heightfield
    heightFieldScale: 3574, // Altitude corresponding to 255 in heightfield
    projection: 'EPSG:2154',
}));

// Adds our Imagery source & layer
// Source data from Copernicus https://land.copernicus.eu/imagery-in-situ/european-image-mosaics/very-high-resolution/vhr-2012
const imagerySource = new CustomTiledImageSource({
    url: 'https://3d.oslandia.com/ecrins/ecrins.json',
    networkOptions: { crossOrigin: 'same-origin' },
});
map.addLayer(new ColorLayer('copernicus', {
    updateStrategy: {
        type: STRATEGY_DICHOTOMY,
        options: {},
    },
    source: imagerySource,
    projection: 'EPSG:2154',
}));

const gridFeatures = new Collection();
const gridsource = new VectorSource({ features: gridFeatures });

const gridLayer = new ColorLayer(
    'grid',
    {
        source: gridsource,
        projection: 'EPSG:2154',
    },
);
gridLayer.style = (Style, Fill, Stroke) => () => new Style({
    stroke: new Stroke({
        color: '#FF0000',
        width: 0.5,
    }),
});
map.addLayer(gridLayer);

const gridSize = 500;
for (
    let x = map.extent.west();
    x <= map.extent.east();
    x += gridSize
) {
    gridFeatures.push(
        new Feature({
            geometry: new LineString([
                [x, map.extent.south()],
                [x, map.extent.north()],
            ]),
        }),
    );
}
for (
    let y = map.extent.south();
    y <= map.extent.north();
    y += gridSize
) {
    gridFeatures.push(
        new Feature({
            geometry: new LineString([
                [map.extent.west(), y],
                [map.extent.east(), y],
            ]),
        }),
    );
}
instance.notifyChange(map);

// Sets the camera position
const cameraPosition = new Coordinates(
    'EPSG:2154',
    extent.west(), extent.south(), 2000,
).xyz();
instance.camera.camera3D.position.copy(cameraPosition);

// Creates controls
const controls = new MapControls(
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

Inspector.attach(document.getElementById('panelDiv'), instance);
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));
