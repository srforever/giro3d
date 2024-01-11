import * as turf from '@turf/turf';
import XYZ from 'ol/source/XYZ.js';
import {
    Group, LineBasicMaterial, MeshBasicMaterial, PointsMaterial, Vector2, Vector3,
} from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import GeoTIFFFormat from '@giro3d/giro3d/formats/GeoTIFFFormat.js';
import DrawTool, { DrawToolMode, DrawToolState } from '@giro3d/giro3d/interactions/DrawTool.js';
import Drawing from '@giro3d/giro3d/interactions/Drawing.js';
import Fetcher from '@giro3d/giro3d/utils/Fetcher';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';

import StatusBar from './widgets/StatusBar.js';

// Initialize Giro3d (see tifftiles for more details)
const x = -13602618.385789588;
const y = 5811042.273912458;

const extent = new Extent(
    'EPSG:3857',
    x - 12000, x + 13000,
    y - 4000, y + 26000,
);

const instance = new Instance(document.getElementById('viewerDiv'), {
    crs: extent.crs(),
    renderer: {
        clearColor: 0x0a3b59,
    },
});

const map = new Map('planar', {
    extent,
    hillshading: true,
    segments: 128,
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

    const extentAsPolygon = turf.helpers.polygon([[
        corners[0],
        corners[1],
        corners[2],
        corners[3],
        corners[0],
    ]]);

    const intersects = turf.booleanIntersects(turf.toWgs84(extentAsPolygon), footprint);

    return intersects;
}

Fetcher.json('data/MtStHelens-footprint.geojson').then(geojson => {
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

    map.addLayer(new ElevationLayer({
        name: 'osm',
        extent,
        source,
    })).catch(e => console.error(e));
}).catch(e => console.error(e));

const center = extent.centerAsVector3();
instance.camera.camera3D.position.set(center.x, center.y - 1, 50000);

// Instanciates controls
// Beware: we need to bind them to *instance.domElement* so we can interact over 2D labels!
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

controls.target.copy(center);
instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);
instance.domElement.addEventListener('dblclick', e => console.log(instance.pickObjectsAt(e)));

// Instanciate drawtool
const drawToolOptions = {
    drawObject3DOptions: {
        minExtrudeDepth: 40,
        maxExtrudeDepth: 100,
    },
    enableDragging: document.getElementById('dragging').value === '0',
    splicingHitTolerance: (
        document.getElementById('splicingtoleranceEnabled').checked
            ? parseInt(document.getElementById('splicingtolerance').value, 10)
            : undefined
    ),
    minPoints: (
        document.getElementById('minpointsEnabled').checked
            ? parseInt(document.getElementById('minpoints').value, 10)
            : undefined
    ),
    maxPoints: (
        document.getElementById('maxpointsEnabled').checked
            ? parseInt(document.getElementById('maxpoints').value, 10)
            : undefined
    ),
    enableAddPointsOnEdit: document.getElementById('addpointsEnabled').checked,
    use3Dpoints: document.getElementById('pointsrendering').value === '0',
    point2DFactory: point2DFactoryHighlighted,
};
const drawTool = new DrawTool(instance, drawToolOptions);

// Prevent drawing when the user is interacting (panning, etc.)
controls.addEventListener('change', () => drawTool.pause());
controls.addEventListener('end', () => setTimeout(() => drawTool.continue(), 0));

// Let's plug our buttons to the drawTool API
const updateDragging = () => {
    drawToolOptions.enableDragging = document.getElementById('dragging').value === '0';
    drawTool.setOptions(drawToolOptions);
};
const updateSplicingTolerance = () => {
    drawToolOptions.splicingHitTolerance = document.getElementById('splicingtoleranceEnabled').checked
        ? parseInt(document.getElementById('splicingtolerance').value, 10)
        : undefined;
    drawTool.setOptions(drawToolOptions);
};
const updateMinpoints = () => {
    drawToolOptions.minPoints = document.getElementById('minpointsEnabled').checked
        ? parseInt(document.getElementById('minpoints').value, 10)
        : undefined;
    drawTool.setOptions(drawToolOptions);
};
const updateMaxpoints = () => {
    drawToolOptions.maxPoints = document.getElementById('maxpointsEnabled').checked
        ? parseInt(document.getElementById('maxpoints').value, 10)
        : undefined;
    drawTool.setOptions(drawToolOptions);
};
const updateAddPoints = () => {
    drawToolOptions.enableAddPointsOnEdit = document.getElementById('addpointsEnabled').checked;
    drawTool.setOptions(drawToolOptions);
};

document.getElementById('dragging').addEventListener('change', updateDragging);
document.getElementById('splicingtoleranceEnabled').addEventListener('change', updateSplicingTolerance);
document.getElementById('splicingtolerance').addEventListener('change', updateSplicingTolerance);
document.getElementById('minpointsEnabled').addEventListener('change', updateMinpoints);
document.getElementById('minpoints').addEventListener('change', updateMinpoints);
document.getElementById('maxpointsEnabled').addEventListener('change', updateMaxpoints);
document.getElementById('maxpoints').addEventListener('change', updateMaxpoints);
document.getElementById('addpointsEnabled').addEventListener('change', updateAddPoints);

document.getElementById('addPoint').onclick = () => {
    if (drawTool.state !== DrawToolState.READY) {
        // We're already drawing, do something with the current drawing
        if (drawTool.mode === DrawToolMode.EDIT) drawTool.end();
        else drawTool.reset();
    }

    // Display help
    for (const o of document.getElementsByClassName('helper')) {
        o.classList.add('d-none');
    }
    document.getElementById('addPointHelper').classList.remove('d-none');
    document.getElementById('options').setAttribute('disabled', true);

    // Start drawing!
    drawTool.start('MultiPoint');
};

document.getElementById('addLine').onclick = () => {
    if (drawTool.state !== DrawToolState.READY) {
        if (drawTool.mode === DrawToolMode.EDIT) drawTool.end();
        else drawTool.reset();
    }

    for (const o of document.getElementsByClassName('helper')) {
        o.classList.add('d-none');
    }
    document.getElementById('addLineHelper').classList.remove('d-none');
    document.getElementById('options').setAttribute('disabled', true);

    drawTool.start('LineString');
};

document.getElementById('addPolygon').onclick = () => {
    if (drawTool.state !== DrawToolState.READY) {
        if (drawTool.mode === DrawToolMode.EDIT) drawTool.end();
        else drawTool.reset();
    }

    for (const o of document.getElementsByClassName('helper')) {
        o.classList.add('d-none');
    }
    document.getElementById('addPolygonHelper').classList.remove('d-none');
    document.getElementById('options').setAttribute('disabled', true);

    drawTool.start('Polygon');
};

// Hide the help when we're done drawing
drawTool.addEventListener('end', () => {
    for (const o of document.getElementsByClassName('helper')) {
        o.classList.add('d-none');
    }
    document.getElementById('mainHelper').classList.remove('d-none');
    document.getElementById('options').removeAttribute('disabled');
});

// When we're done drawing, the drawTool removes the shape.
// We want to keep it displayed so we can edit it.
// We'll add our shapes in a group, so we can also raycast against them for hovering/clicking.
const drawnShapes = new Group();
instance.add(drawnShapes);

// We'll use different materials for displaying drawn shapes
const drawnFaceMaterial = new MeshBasicMaterial({
    color: 0x433C73,
    opacity: 0.2,
});
const drawnSideMaterial = new MeshBasicMaterial({
    color: 0x433C73,
    opacity: 0.8,
});
const drawnLineMaterial = new LineBasicMaterial({
    color: 0x252140,
});
const drawnPointMaterial = new PointsMaterial({
    color: 0x433C73,
    size: 100,
});

// If using CSS2DRenderer for points, we define our own (optional) factory
function point2DFactory(text) {
    const pt = document.createElement('div');
    pt.style.position = 'absolute';
    pt.style.borderRadius = '50%';
    pt.style.width = '28px';
    pt.style.height = '28px';
    pt.style.backgroundColor = '#433C73';
    pt.style.color = '#ffffff';
    pt.style.border = '2px solid #070607';
    pt.style.fontSize = '14px';
    pt.style.textAlign = 'center';
    pt.style.pointerEvents = 'auto';
    pt.style.cursor = 'pointer';
    pt.innerText = text;
    return pt;
}

function point2DFactoryHighlighted(text) {
    const pt = document.createElement('div');
    pt.style.position = 'absolute';
    pt.style.borderRadius = '50%';
    pt.style.width = '28px';
    pt.style.height = '28px';
    pt.style.backgroundColor = '#347330';
    pt.style.color = '#ffffff';
    pt.style.border = '2px solid #070607';
    pt.style.fontSize = '14px';
    pt.style.textAlign = 'center';
    pt.style.pointerEvents = 'auto';
    pt.style.cursor = 'pointer';
    pt.innerText = text;
    return pt;
}

const updatePointsRendering = () => {
    // Update existing drawings
    for (const o of drawnShapes.children) {
        if (o.geometryType === 'MultiPoint') {
            o.clear();
            o.use3Dpoints = document.getElementById('pointsrendering').value === '0';
            o.update();
        }
    }
};
document.getElementById('pointsrendering').addEventListener('change', updatePointsRendering);

function addShape(geojson) {
    // Create and show a new object with the same geometry but with different materials
    const o = new Drawing(instance, {
        faceMaterial: drawnFaceMaterial,
        sideMaterial: drawnSideMaterial,
        lineMaterial: drawnLineMaterial,
        pointMaterial: drawnPointMaterial,
        minExtrudeDepth: 40,
        maxExtrudeDepth: 100,
        use3Dpoints: document.getElementById('pointsrendering').value === '0',
        point2DFactory: index => point2DFactory(`${index + 1}`),
    }, geojson);

    if (!o.use3Dpoints && (o.geometryType === 'Point' || o.geometryType === 'MultiPoint')) {
        // Edit the shape when clicking on points
        for (const pt of o.children) {
            pt.element.addEventListener('click', () => {
                drawTool.edit(o);
            });
        }
    }

    // And add it to our scene
    drawnShapes.add(o);
    instance.notifyChange(drawnShapes);
}

// Listen to when we are done drawing
drawTool.addEventListener('end', evt => addShape(evt.geojson));

// At this point we:
// - can add new shapes,
// - have them displayed when done.

// Let's add selection & edition!

function getDrawnShapeAt(evt) {
    const picked = instance.pickObjectsAt(evt, { where: [drawnShapes], limit: 1, radius: 5 });
    // If we pick something, return the drawn shape (parent of the mesh found)
    return picked.length > 0 ? picked[0].object.parent : null;
}

// Display a nice pointer when the user is over a drawn shape
instance.domElement.addEventListener('mousemove', evt => {
    if (drawTool.state !== DrawToolState.READY) return;
    const picked = getDrawnShapeAt(evt);
    instance.domElement.style.cursor = picked ? 'pointer' : 'default';
});

// Edit a shape when clicking on it
instance.domElement.addEventListener('click', evt => {
    if (drawTool.state !== DrawToolState.READY) return;
    const picked = getDrawnShapeAt(evt);
    if (picked) {
        for (const o of document.getElementsByClassName('helper')) {
            o.classList.add('d-none');
        }
        document.getElementById('editHelper').classList.remove('d-none');
        document.getElementById('options').setAttribute('disabled', true);

        instance.domElement.style.cursor = 'default';

        // When editing a DrawObject3D directly, materials and options are not reset from drawTool.
        picked.setMaterials({}); // Reset the materials
        drawTool.edit(picked);
    }
});

// Load some shapes
Fetcher.json('https://3d.oslandia.com/dem/features.json').then(features => {
    features.forEach(feature => {
        drawTool.edit(feature);
        // Mess around with the API
        drawTool.insertPointAt(0, new Vector3(0, 0, 0));
        drawTool.updatePointAt(0, new Vector2(1, 2, 3));
        drawTool.deletePoint(0);
        drawTool.end();
    });
});

// Add some shapes via API
drawTool.start();
drawTool.addPointAt(new Vector3(0, 0, 0));
drawTool.addPointAt(new Vector3(1, 2, 3));
drawTool.addPointAt(new Vector3(-13601375.735757545, 5811313.553932933, 2263.4501953125));
drawTool.addPointAt(new Vector3(-13601183.080786511, 5811718.900814531, 2169.449462890625));
drawTool.addPointAt(new Vector3(-13601435.612581342, 5811988.171339845, 2113.301025390625));
drawTool.addPointAt(new Vector3(-13601692.241683275, 5812247.386654718, 2098.3310546875));
drawTool.addPointAt(new Vector3(-13601229.646728978, 5812162.072989969, 2098.95068359375));
drawTool.addPointAt(new Vector3(-13601285.151505515, 5812670.5826594215, 2013.54736328125));
drawTool.addPointAt(new Vector3(-13601435.248480782, 5813288.373160986, 1857.339111328125));
drawTool.addPointAt(new Vector3(-13601878.109128818, 5813344.696319774, 1802.1083984375));
drawTool.addPointAt(new Vector3(-13602217.049078688, 5813161.852430431, 1857.4925537109375));
drawTool.addPointAt(new Vector3(-13602524.077633068, 5812790.909256665, 1967.9317626953125));
drawTool.addPointAt(new Vector3(-13602730.889452294, 5812173.281410588, 2093.4921875));
drawTool.addPointAt(new Vector3(-13602525.81417714, 5811603.776026396, 2215.937744140625));
drawTool.updatePointAt(0, new Vector3(-13601908.711527146, 5811403.3703095, 2241.1591796875));
drawTool.deletePoint(1);
drawTool.end();

StatusBar.bind(instance);
