import * as turf from '@turf/turf';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import XYZ from 'ol/source/XYZ.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import GeoTIFFFormat from '@giro3d/giro3d/formats/GeoTIFFFormat.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import Fetcher from '@giro3d/giro3d/utils/Fetcher.js';

import StatusBar from './widgets/StatusBar.js';

const x = -13602618.385789588;
const y = 5811042.273912458;

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent('EPSG:3857', x - 12000, x + 13000, y - 4000, y + 26000);

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
const map = new Map('planar', {
    extent,
    hillshading: true,
    segments: 128,
    doubleSided: true,
    discardNoData: true,
    backgroundColor: 'white',
});

instance.add(map);

let footprint;

/**
 * A function that will override the default intersection test for image sources (by default
 * performing intersection on extents, i.e rectangles). Here we want to exclude tiles that do not
 * intersect with the GeoJSON footprint of the dataset.
 *
 * @param {Extent} tileExtent The extent to test.
 */
function customIntersectionTest(tileExtent) {
    if (!footprint) {
        return true;
    }

    const corners = [
        [tileExtent.topLeft().x, tileExtent.topLeft().y],
        [tileExtent.topRight().x, tileExtent.topRight().y],
        [tileExtent.bottomRight().x, tileExtent.bottomRight().y],
        [tileExtent.bottomLeft().x, tileExtent.bottomLeft().y],
    ];

    const extentAsPolygon = turf.helpers.polygon([
        [corners[0], corners[1], corners[2], corners[3], corners[0]],
    ]);

    const intersects = turf.booleanIntersects(turf.toWgs84(extentAsPolygon), footprint);

    return intersects;
}

Fetcher.json('data/MtStHelens-footprint.geojson')
    .then(geojson => {
        footprint = turf.toWgs84(geojson);

        const source = new TiledImageSource({
            containsFn: customIntersectionTest, // Here we specify our custom intersection test
            source: new XYZ({
                minZoom: 10,
                maxZoom: 16,
                url: 'https://3d.oslandia.com/dem/MtStHelens-tiles/{z}/{x}/{y}.tif',
            }),
            format: new GeoTIFFFormat(),
        });

        map.addLayer(
            new ElevationLayer({
                name: 'osm',
                extent,
                source,
            }),
        ).catch(e => console.error(e));
    })
    .catch(e => console.error(e));

const center = extent.centerAsVector3();
instance.camera.camera3D.position.set(center.x, center.y - 1, 50000);

// Instanciates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

controls.target.copy(center);

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

// Bind events
StatusBar.bind(instance);
