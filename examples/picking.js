import { Raycaster, Vector3, Vector2 } from 'three';
import TileWMS from 'ol/source/TileWMS.js';
import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import { STRATEGY_DICHOTOMY } from '@giro3d/giro3d/core/layer/LayerUpdateStrategy.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Interpretation from '@giro3d/giro3d/core/layer/Interpretation.js';
import PointsMaterial, { MODE } from '@giro3d/giro3d/renderer/PointsMaterial.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';

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
const wmsSource = new TileWMS({
    url: 'https://download.data.grandlyon.com/wms/grandlyon',
    projection: 'EPSG:3946',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['Ortho2018_Dalle_unique_8cm_CC46'],
        FORMAT: 'image/jpeg',
    },
    version: '1.3.0',
});

const colorLayer = new ColorLayer(
    'wms_imagery',
    {
        source: wmsSource,
        updateStrategy: {
            type: STRATEGY_DICHOTOMY,
            options: {},
        },
    },
);
map.addLayer(colorLayer);

// Adds a WMS elevation layer
const wmsSource2 = new TileWMS({
    url: 'https://download.data.grandlyon.com/wms/grandlyon',
    projection: 'EPSG:3946',
    crossOrigin: 'anonymous',
    params: {
        LAYERS: ['MNT2018_Altitude_2m'],
        FORMAT: 'image/jpeg',
    },
    version: '1.3.0',
});

const elevationLayer = new ElevationLayer(
    'wms_elevation',
    {
        source: wmsSource2,
        interpretation: Interpretation.ScaleToMinMax(149, 621),
    },
);

map.addLayer(elevationLayer);

// Sets the camera position
const cameraPosition = new Coordinates(
    'EPSG:3946',
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

instance.domElement.addEventListener('dblclick', e => {
    let t0 = performance.now();
    const picked = instance.pickObjectsAt(e, {
        radius: parseInt(radiusSlider.value, 10),
        limit: limitSlider.value === '0' ? undefined : parseInt(limitSlider.value, 10),
        where,
        // Remove uncoherent points from result
        filter: p => !Number.isNaN(p.point.x) && !Number.isNaN(p.point.y) && p.point.z < 1000,
    });
    let t1 = performance.now();
    console.log('Picked', picked);
    document.getElementById('pickingTiming').innerHTML = `${t1 - t0}ms`;
    document.getElementById('pickingCount').innerHTML = `${picked.length}`;
    document.getElementById('pickingFirstResult').innerHTML = picked.length > 0
        ? `<ul><li>Point: ${picked[0].point.x.toFixed(2)}, ${picked[0].point.y.toFixed(2)}, ${picked[0].point.z.toFixed(2)}</li>
<li>Entity: ${picked[0].layer.id} (${picked[0].layer.type})</li>
</ul>` : '';

    t0 = performance.now();
    const raycasted = raycast(e);
    t1 = performance.now();
    console.log('Raycasted', raycasted);
    document.getElementById('raycastingTiming').innerHTML = `${t1 - t0}ms`;
    document.getElementById('raycastingCount').innerHTML = `${raycasted.length}`;
    document.getElementById('raycastingFirstResult').innerHTML = raycasted.length > 0
        ? `<ul><li>Point: ${raycasted[0].point.x.toFixed(2)}, ${raycasted[0].point.y.toFixed(2)}, ${raycasted[0].point.z.toFixed(2)}</li>
<li>Entity: ${raycasted[0].layer.id} (${raycasted[0].layer.type})</li>
</ul>` : '';

    t0 = performance.now();
    const projected = project(e, controls.target.z);
    t1 = performance.now();
    console.log('Projected', projected);
    document.getElementById('projectingTiming').innerHTML = `${t1 - t0}ms`;
    document.getElementById('projectingResult').innerHTML = `${projected.x.toFixed(2)}, ${projected.y.toFixed(2)}, ${projected.z.toFixed(2)}`;
});

const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
popoverTriggerList.map(
    // bootstrap is used as script in the template, disable warning about undef
    // eslint-disable-next-line no-undef
    popoverTriggerEl => new bootstrap.Popover(popoverTriggerEl, {
        trigger: 'hover',
        placement: 'left',
        content: document.getElementById(popoverTriggerEl.getAttribute('data-bs-content')).innerHTML,
        html: true,
    }),
);
