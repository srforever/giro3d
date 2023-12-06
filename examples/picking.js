import TileWMS from 'ol/source/TileWMS.js';
import { Raycaster, Vector3, Vector2 } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import BilFormat from '@giro3d/giro3d/formats/BilFormat.js';
import PointsMaterial, { MODE } from '@giro3d/giro3d/renderer/PointsMaterial.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import { MAIN_LOOP_EVENTS } from '@giro3d/giro3d/core/MainLoop.js';
import StatusBar from './widgets/StatusBar.js';

Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 '
    + '+y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

const extent = new Extent(
    'EPSG:3946',
    1837816.94334, 1847692.32501,
    5170036.4587, 5178412.82698,
);

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, {
    crs: 'EPSG:3946',
    renderer: {
        clearColor: 0xcccccc,
    },
});

// Create the 3D tiles entity
const pointcloud = new Tiles3D(
    'pointcloud',
    new Tiles3DSource('https://3d.oslandia.com/3dtiles/lyon.3dtiles/tileset.json'),
    {
        material: new PointsMaterial({
            size: 4,
            mode: MODE.COLOR,
        }),
    },
);
pointcloud.material.transparent = true;
pointcloud.material.needsUpdate = true;
pointcloud.material.opacity = 0.5;
instance.add(pointcloud);

const map = new Map('map', { extent });
instance.add(map);

// Adds a WMS imagery layer
const colorSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://wxs.ign.fr/ortho/geoportail/r/wms',
        projection: 'EPSG:3946',
        params: {
            LAYERS: ['HR.ORTHOIMAGERY.ORTHOPHOTOS'],
            FORMAT: 'image/jpeg',
        },
    }),
});

const colorLayer = new ColorLayer({
    name: 'wms_imagery',
    extent: map.extent,
    source: colorSource,
});
map.addLayer(colorLayer);

// Adds a WMS elevation layer
const elevationSource = new TiledImageSource({
    source: new TileWMS({
        url: 'https://wxs.ign.fr/altimetrie/geoportail/r/wms',
        projection: 'EPSG:3946',
        crossOrigin: 'anonymous',
        params: {
            LAYERS: ['ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES'],
            FORMAT: 'image/x-bil;bits=32',
        },
    }),
    format: new BilFormat(),
    noDataValue: -1000,
});

const elevationLayer = new ElevationLayer({
    name: 'wms_elevation',
    extent: map.extent,
    source: elevationSource,
});

map.addLayer(elevationLayer);

// Sets the camera position
const cameraPosition = new Coordinates(
    'EPSG:3946',
    extent.west(), extent.south(), 2000,
).xyz();
instance.camera.camera3D.position.copy(cameraPosition);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

// Then looks at extent's center
controls.target = extent.center().xyz();
controls.target.z = 200;
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

const radiusSlider = document.getElementById('radiusSlider');
const limitSlider = document.getElementById('limitSlider');

let where = ['map'];
document.getElementById('pickSource').addEventListener('change', e => {
    const newMode = parseInt(e.target.value, 10);
    if (newMode === 1) {
        where = ['pointcloud'];
    } else if (newMode === 2) {
        where = ['map'];
    } else {
        where = undefined;
    }
});

const raycaster = new Raycaster();

function findLayerInParent(obj) {
    if (obj.layer) {
        return obj.layer;
    }
    if (obj.parent) {
        return findLayerInParent(obj.parent);
    }
    return null;
}

const tmp = { vec2: new Vector2() };

function raycast(evt) {
    const results = [];
    const pointer = instance.eventToNormalizedCoords(evt, tmp.vec2).clone();

    raycaster.setFromCamera(pointer, instance.camera.camera3D);
    const picked = raycaster.intersectObject(instance.scene, true);
    for (const inter of picked) {
        inter.layer = findLayerInParent(inter.object);
        results.push(inter);
    }
    return results;
}

function project(evt, zDefault = 0) {
    // Fallback to getting coordinates assuming click is on Z=zDefault
    const ndc = instance.eventToNormalizedCoords(evt, tmp.vec2).clone();
    const vec = new Vector3(ndc.x, ndc.y, 0.5);
    vec.unproject(instance.camera.camera3D);

    vec.sub(instance.camera.camera3D.position).normalize();

    const distance = (zDefault - instance.camera.camera3D.position.z) / vec.z;
    const scaled = vec.multiplyScalar(distance);
    return instance.camera.camera3D.position.clone().add(scaled);
}

const formatter = new Intl.NumberFormat();

instance.domElement.addEventListener('dblclick', e => {
    const elem = id => document.getElementById(id);
    let t0 = performance.now();
    function format(point) {
        return `x: ${formatter.format(point.x)}\n
                y: ${formatter.format(point.y)}\n
                z: ${formatter.format(point.z)}`;
    }
    const picked = instance.pickObjectsAt(e, {
        radius: parseInt(radiusSlider.value, 10),
        limit: limitSlider.value === '0' ? undefined : parseInt(limitSlider.value, 10),
        where,
        // Remove uncoherent points from result
        filter: p => !Number.isNaN(p.point.x) && !Number.isNaN(p.point.y) && p.point.z < 1000,
    });
    let t1 = performance.now();
    console.log('Picked', picked);
    elem('pickingTiming').innerHTML = `${t1 - t0}`;
    elem('pickingCount').innerHTML = `${picked.length}`;
    elem('pickingCoord').innerHTML = picked.length > 0 ? format(picked[0].point) : '-';
    elem('pickingFirstResult').innerHTML = picked.length > 0
        ? `${picked[0].layer.id} (${picked[0].layer.type})`
        : '-';

    t0 = performance.now();
    const raycasted = raycast(e);
    t1 = performance.now();
    console.log('Raycasted', raycasted);

    elem('raycastingTiming').innerHTML = `${t1 - t0}`;
    elem('raycastingCount').innerHTML = `${raycasted.length}`;
    elem('raycastingCoord').innerHTML = raycasted.length > 0 ? format(raycasted[0].point) : '-';
    elem('raycastingFirstResult').innerHTML = raycasted.length > 0
        ? `${raycasted[0].layer.id} (${raycasted[0].layer.type})`
        : '-';

    t0 = performance.now();
    const projected = project(e, controls.target.z);
    t1 = performance.now();
    console.log('Projected', projected);
    elem('projectingTiming').innerHTML = `${t1 - t0}`;
    elem('projectingCoord').innerHTML = format(projected);
});

StatusBar.bind(instance);
