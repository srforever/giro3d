import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import CogSource from '@giro3d/giro3d/sources/CogSource.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

import StatusBar from './widgets/StatusBar.js';

const extent = Extent.fromCenterAndSize('EPSG:3857', { x: -13555565, y: 5919254 }, 20000, 20000);

// `viewerDiv` will contain Giro3D' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Instantiate Giro3D
const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
});

// Instantiate the camera
instance.camera.camera3D.position.set(-13577183, 5907053, 45050);

// Instantiate the controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.target.set(-13557038, 5920026, 0);
instance.useTHREEControls(controls);

// Construct a map and add it to the instance
const map = new Map('planar', {
    extent,
    backgroundColor: 'gray',
    hillshading: true,
});
instance.add(map);

// Use an elevation COG with nodata values
const source = new CogSource({
    // https://www.sciencebase.gov/catalog/item/632a9a9ad34e71c6d67b95a3
    url: 'https://3d.oslandia.com/cog_data/COG_EPSG3857_USGS_13_n47w122_20220919.tif',
    crs: extent.crs(),
});

const min = 263;
const max = 4347;

map.addLayer(
    new ElevationLayer({
        name: 'elevation',
        extent,
        source,
        preloadImages: false,
        minmax: { min, max },
    }),
);

// Attach the inspector
Inspector.attach(document.getElementById('panelDiv'), instance);

StatusBar.bind(instance);
