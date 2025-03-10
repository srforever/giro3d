import {
    Vector3,
    Group,
    Mesh,
    BoxGeometry,
    SphereGeometry,
    MeshLambertMaterial,
    DirectionalLight,
    AmbientLight,
} from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Tiles3D from '@giro3d/giro3d/entities/Tiles3D.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import BilFormat from '@giro3d/giro3d/formats/BilFormat.js';
import Tiles3DSource from '@giro3d/giro3d/sources/Tiles3DSource.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import WmtsSource from '@giro3d/giro3d/sources/WmtsSource.js';
import PointCloudMaterial from '@giro3d/giro3d/renderer/PointCloudMaterial.js';

// Defines projection that we will use (taken from https://epsg.io/2154, Proj4js section)
Instance.registerCRS(
    'EPSG:2154',
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
);
Instance.registerCRS(
    'IGNF:WGS84G',
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]',
);

const extent = new Extent('EPSG:2154', -111629.52, 1275028.84, 5976033.79, 7230161.64);

const viewerDiv = document.getElementById('viewerDiv');

const instance = new Instance(viewerDiv, {
    crs: extent.crs(),
    renderer: {
        clearColor: 0xcccccc,
    },
});

instance.renderingOptions.enableEDL = true;
instance.renderingOptions.enableInpainting = true;
instance.renderingOptions.enablePointCloudOcclusion = true;

// create a map
const map = new Map('map', {
    extent,
    backgroundColor: 'gray',
    supportRaycast: true,
    hillshading: {
        enabled: true,
        elevationLayersOnly: true,
    },
});
instance.add(map);

const noDataValue = -1000;

const capabilitiesUrl =
    'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities';

WmtsSource.fromCapabilities(capabilitiesUrl, {
    layer: 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES',
    format: new BilFormat(),
    noDataValue,
})
    .then(elevationWmts => {
        map.addLayer(
            new ElevationLayer({
                name: 'wmts_elevation',
                extent: map.extent,
                // We don't need the full resolution of terrain because we are not using any shading
                resolutionFactor: 0.25,
                minmax: { min: 0, max: 5000 },
                noDataOptions: {
                    replaceNoData: false,
                },
                source: elevationWmts,
            }),
        );
    })
    .catch(console.error);

WmtsSource.fromCapabilities(capabilitiesUrl, {
    layer: 'HR.ORTHOIMAGERY.ORTHOPHOTOS',
})
    .then(orthophotoWmts => {
        map.addLayer(
            new ColorLayer({
                name: 'wmts_orthophotos',
                extent: map.extent,
                source: orthophotoWmts,
            }),
        );
    })
    .catch(console.error);

// Create the 3D tiles entity
const pointcloud = new Tiles3D(
    'pointcloud',
    new Tiles3DSource('https://3d.oslandia.com/lidar_hd/tileset.json'),
    {
        material: new PointCloudMaterial(),
    },
);

instance.add(pointcloud);

// also add some lights
const sun = new DirectionalLight('#ffffff', 1.4);
sun.position.set(-1, -2, 1).normalize();
sun.updateMatrixWorld(true);
instance.scene.add(sun);

// We can look below the floor, so let's light also a bit there
const sun2 = new DirectionalLight('#ffffff', 0.5);
sun2.position.set(0, 1, 1);
sun2.updateMatrixWorld();
instance.scene.add(sun2);

// ambient
const ambientLight = new AmbientLight(0xffffff, 0.2);
instance.scene.add(ambientLight);

const cube = new Mesh(new BoxGeometry(300, 300, 300), new MeshLambertMaterial({ color: 'blue' }));
cube.name = 'cube';

cube.position.set(913741, 6459089, 369);
instance.add(cube);
cube.updateMatrixWorld(true);

// place camera above grenoble
instance.camera.camera3D.position.set(913349.2364044407, 6456426.459171033, 1706.0108044011636);

// and look at the Bastille
const lookAt = new Vector3(913896, 6459191, 200);
instance.camera.camera3D.lookAt(lookAt);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

// Then looks at extent's center
controls.target.copy(lookAt);
controls.saveState();

controls.enableDamping = true;
controls.dampingFactor = 0.2;

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

const markerMaterial = new MeshLambertMaterial({
    color: 'red',
});

const markerGroup = new Group();
instance.add(markerGroup);

const options = {
    gpuPicking: false,
    showMarkers: true,
    pickPointCloudOnly: false,
    pickMapOnly: false,
    radius: 0,
    limit: 0,
    pickEvent: 'mousemove',
};

function bindCheckBox(name, callback) {
    const elt = document.getElementById(name);
    elt.onchange = () => {
        callback(elt.checked);
    };
}

function bindNumericUpDown(name, callback) {
    const elt = document.getElementById(name);
    elt.onchange = () => {
        const value = parseInt(elt.value, 10);
        callback(value);
    };
}

function bindDropDown(name, callback) {
    const mode = document.getElementById(name);
    mode.onchange = () => {
        callback(mode.value);
    };
}

bindDropDown('pickEvent', v => (options.pickEvent = v));

bindCheckBox('gpuPicking', v => (options.gpuPicking = v));
bindCheckBox('showMarkers', v => {
    options.showMarkers = v;
    if (!v) {
        markerGroup.clear();
        instance.notifyChange();
    }
});
bindCheckBox('pickMap', v => (options.pickMapOnly = v));
bindCheckBox('pickPointCloud', v => (options.pickPointCloudOnly = v));

bindNumericUpDown('radius', v => (options.radius = v));
bindNumericUpDown('limit', v => (options.limit = v));

function updateResultTable(pickResults) {
    const table = document.getElementById('table');
    const resultList = document.getElementById('results');

    resultList.innerHTML = '';

    function column(content) {
        const col = document.createElement('td');
        col.innerHTML = content;
        return col;
    }

    const emptyWarning = document.getElementById('emptyWarning');
    if (pickResults.length > 0) {
        emptyWarning.style.display = 'none';
        table.style.display = 'unset';
    } else {
        emptyWarning.style.display = 'unset';
        table.style.display = 'none';
    }

    for (let index = 0; index < pickResults.length; index++) {
        const pickResult = pickResults[index];
        const tr = document.createElement('tr');

        // result #
        tr.appendChild(column(`${index}`));
        // entity
        const entity = pickResult.entity;
        tr.appendChild(column(entity ? `<code>${pickResult.entity?.id}</code>` : 'none'));
        // picked object
        const type = pickResult.object.type;
        tr.appendChild(column(`<span class="badge rounded-pill text-bg-primary">${type}</span>`));

        /** @type {Vector3} */
        const point = pickResult.point;

        // X, Y, Z coordinates of point
        tr.appendChild(column(point.x.toFixed(0)));
        tr.appendChild(column(point.y.toFixed(0)));
        tr.appendChild(column(point.z.toFixed(0)));

        resultList.appendChild(tr);
    }
}

const sphere = new SphereGeometry(8);

function performPicking(mouseEvent) {
    // Determine which entities to include
    let where = [];
    if (options.pickMapOnly) {
        where.push(map);
    }

    if (options.pickPointCloudOnly) {
        where.push(pointcloud);
    }

    const pickOptions = {
        limit: options.limit === 0 ? undefined : options.limit,
        radius: options.radius,
        gpuPicking: options.gpuPicking,
        where: where.length > 0 ? where : undefined,
        sortByDistance: true,
    };

    const start = performance.now();
    const results = instance.pickObjectsAt(mouseEvent, pickOptions);
    const end = performance.now();

    document.getElementById('latency').innerText = `Latency: ${(end - start).toFixed(1)} ms`;

    const noRaycast = () => {
        /** empty */
    };

    if (options.showMarkers && results.length > 0) {
        const position = results[0].point;
        const marker = new Mesh(sphere, markerMaterial);
        // Disable raycasting on markers to avoid picking them.
        marker.raycast = noRaycast;
        if (markerGroup.children.length > 30) {
            const removed = markerGroup.children.splice(0, markerGroup.children.length - 30);
            removed.forEach(item => item.removeFromParent());
        }

        // - In the case of CPU picking, the Z value is simply the Z-coordinate of
        // the picked point, which itself is affected by the scale of the scene.
        //
        // - In the case of GPU picking, the Z value is sampled from the texture, unaffected
        // by the scale of the scene. That is why we have to apply the scene scale to obtain the
        // correct world space coordinate.
        if (options.gpuPicking) {
            position.multiply(instance.scene.scale);
        }

        marker.position.copy(position);
        // Notice we use attach instead of add so that world position is
        // preserved in case of non-default scale.
        markerGroup.attach(marker);
        marker.updateMatrixWorld(true);
        instance.notifyChange();
    }

    updateResultTable(results);
}

function onMouseMove(mouseEvent) {
    if (options.pickEvent === 'mousemove') {
        performPicking(mouseEvent);
    }
}

function onMouseClick(mouseEvent) {
    if (options.pickEvent === 'click') {
        performPicking(mouseEvent);
    }
}

function bindSlider(name, callback) {
    const slider = document.getElementById(name);
    slider.oninput = function oninput() {
        callback(slider.valueAsNumber);
        instance.notifyChange(map);
    };
}

bindSlider('zScaleSlider', v => {
    instance.scene.scale.setZ(v);
    instance.scene.updateMatrixWorld(true);
    document.getElementById('zScaleLabel').innerText = `Z-scale = ${v.toFixed(1)}`;
});

instance.domElement.addEventListener('mousemove', onMouseMove);
instance.domElement.addEventListener('click', onMouseClick);

instance.scene.updateMatrixWorld(true);

instance.notifyChange();
