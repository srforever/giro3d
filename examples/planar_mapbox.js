import WMTSCapabilities from 'ol/format/WMTSCapabilities.js';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS.js';
import XYZ from 'ol/source/XYZ.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '@giro3d/giro3d/Core/Geographic/Extent.js';
import Instance from '@giro3d/giro3d/Core/Instance.js';
import ColorLayer from '@giro3d/giro3d/Core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/Core/layer/ElevationLayer.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/Core/layer/LayerUpdateStrategy.js';
import Interpretation from '@giro3d/giro3d/Core/layer/Interpretation.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

// Defines projection that we will use (taken from https://epsg.io/3857, Proj4js section)
Instance.registerCRS('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs');

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent('EPSG:3857', 659030, 735596, 5535152, 5647497);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the giro3d instance
const instance = new Instance(viewerDiv);

// Adds the map that will contain the layers.
const map = new Map('planar', { extent, segments: 128 });
instance.add(map);

// Fetch WMTS capabilities for our ColorLayer
fetch('https://wxs.ign.fr/cartes/geoportail/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities', {
    crossOrigin: 'anonymous',
})
    .then(response => response.text())
    .then(text => {
        const parser = new WMTSCapabilities();
        const result = parser.read(text);
        const options = optionsFromCapabilities(result, {
            layer: 'GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950',
            matrixSet: 'EPSG:3857',
            crossOrigin: 'anonymous',
        });

        // Add our layer
        map.addLayer(new ColorLayer(
            'wmts_imagery',
            {
                source: new WMTS(options),
                updateStrategy: {
                    type: STRATEGY_DICHOTOMY,
                    options: {},
                },
            },
        ));
    });

let elevationLayer;

function addElevationLayer(key) {
    if (elevationLayer) {
        map.removeLayer(elevationLayer);
    }

    // Adds a XYZ elevation layer with MapBox elevation format
    elevationLayer = new ElevationLayer(
        'xyz_elevation',
        {
            source: new XYZ({
                url: `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${key}`,
                crossOrigin: 'anonymous',
                projection: extent.crs(),
            }),
            interpretation: Interpretation.MapboxTerrainRGB,
        },
    );
    map.addLayer(elevationLayer);
}

// Create our elevation layer using giro3d's default mapbox api key
addElevationLayer('pk.eyJ1IjoidG11Z3VldCIsImEiOiJjbGJ4dTNkOW0wYWx4M25ybWZ5YnpicHV6In0.KhDJ7W5N3d1z3ArrsDjX_A');

// Sets the camera position
instance.camera.camera3D.position.set(extent.east(), extent.south(), 2000);

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

document.getElementById('mapboxApi').addEventListener('submit', e => {
    e.preventDefault();
    addElevationLayer(document.getElementById('mapboxApiKey').value);
});
