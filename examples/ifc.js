import TileWMS from 'ol/source/TileWMS.js';

import {
    AmbientLight, DirectionalLight, Vector3, MathUtils as ThreeMath,
} from 'three';
import { IFCLoader } from 'three/examples/jsm/loaders/IFCLoader.js';

import { MapControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Extent from '@giro3d/giro3d/core/geographic/Extent.js';
import Instance from '@giro3d/giro3d/core/Instance.js';
import TiledImageSource from '@giro3d/giro3d/sources/TiledImageSource.js';
import ColorLayer from '@giro3d/giro3d/core/layer/ColorLayer.js';
import ElevationLayer from '@giro3d/giro3d/core/layer/ElevationLayer.js';
import Coordinates from '@giro3d/giro3d/core/geographic/Coordinates.js';
import BilFormat from '@giro3d/giro3d/formats/BilFormat.js';
import Map from '@giro3d/giro3d/entities/Map.js';
import Inspector from '@giro3d/giro3d/gui/Inspector.js';
import StatusBar from './widgets/StatusBar.js';

// Defines projection that we will use (taken from https://epsg.io/3946, Proj4js section)
Instance.registerCRS('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Defines geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3946',
    1837816.94334, 1847692.32501,
    5170036.4587, 5178412.82698,
);

// `viewerDiv` will contain giro3d' rendering area (the canvas element)
const viewerDiv = document.getElementById('viewerDiv');

// Creates the giro3d instance
const instance = new Instance(viewerDiv, { crs: extent.crs() });

// Adds lights for the IFC (as a Three object)
const lightColor = 0xffffff;

const ambientLight = new AmbientLight(lightColor, 0.5);
instance.scene.add(ambientLight);

const dirLight = new DirectionalLight(lightColor, 0.5);
dirLight.position.set(1, -1.75, 1);
instance.scene.add(dirLight);
dirLight.updateMatrixWorld();

// Adds the map that will contain the layers.
const map = new Map('planar', { extent });
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

const colorLayer = new ColorLayer(
    'wms_imagery',
    {
        extent,
        source: colorSource,
    },
);
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

const elevationLayer = new ElevationLayer(
    'wms_elevation',
    {
        extent,
        source: elevationSource,
    },
);

map.addLayer(elevationLayer);

// Loads the IFC
const ifcPosition = {
    x: 1839610,
    y: 5173540,
    z: 276.8,
};

const ifcLoader = new IFCLoader();
let ifcModel;
ifcLoader.load(
    'data/AC20-FZK-Haus.ifc', // Found at https://www.ifcwiki.org/index.php?title=File:AC20-FZK-Haus.ifc
    _ifcModel => {
        ifcModel = _ifcModel;
        ifcModel.name = 'ifcModel';

        // Places the object
        ifcModel.translateY(ifcPosition.y)
            .translateX(ifcPosition.x)
            .translateZ(ifcPosition.z);

        // Swaps y and z axis
        ifcModel.lookAt(new Vector3(0, 0, 1));

        ifcModel.rotateY(ThreeMath.degToRad(-18));

        ifcModel.updateMatrixWorld();

        // Adds the object to the instance
        instance.add(ifcModel);
    },
    () => {},
    err => { console.error(err); },
);

// Sets the camera position
const cameraPosition = new Coordinates(
    'EPSG:3946',
    ifcPosition.x + 100, ifcPosition.y + 50, ifcPosition.z + 100,
).xyz();
instance.camera.camera3D.position.copy(cameraPosition);

// Creates controls
const controls = new MapControls(instance.camera.camera3D, instance.domElement);

controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.maxPolarAngle = Math.PI / 2.3;

// Then looks at the IFC object
controls.target = new Vector3(ifcPosition.x, ifcPosition.y, ifcPosition.z);
controls.saveState();

instance.useTHREEControls(controls);

Inspector.attach(document.getElementById('panelDiv'), instance);

const resultsTable = document.getElementById('results-body');
const formatter = new Intl.NumberFormat();

function format(point) {
    return `x: ${formatter.format(point.x)}\n
            y: ${formatter.format(point.y)}\n
            z: ${formatter.format(point.z)}`;
}

instance.domElement.addEventListener('dblclick', e => {
    const picked = instance.pickObjectsAt(e, {
        // Let the user pick only points from IFC model
        where: (document.getElementById('pick_source').value === '1') ? [ifcModel] : null,
    });
    if (picked.length === 0) {
        const row = document.createElement('tr');
        const count = document.createElement('th');
        count.setAttribute('scope', 'row');
        count.innerText = '-';
        const obj = document.createElement('td');
        obj.innerText = '-';
        const coordinates = document.createElement('td');
        coordinates.innerText = '-';
        const distanceToCamera = document.createElement('td');
        distanceToCamera.innerText = '-';
        row.append(count, obj, coordinates, distanceToCamera);
        resultsTable.replaceChildren(row);
    } else {
        const rows = picked.map((p, i) => {
            const row = document.createElement('tr');
            const count = document.createElement('th');
            count.setAttribute('scope', 'row');
            count.innerText = `${i + 1}`;
            const obj = document.createElement('td');
            obj.innerText = `${p.object.name} (${p.object.type})`;
            const coordinates = document.createElement('td');
            coordinates.innerHTML = format(p.point);
            const distanceToCamera = document.createElement('td');
            distanceToCamera.innerText = formatter.format(p.distance);
            row.append(count, obj, coordinates, distanceToCamera);
            return row;
        });
        resultsTable.replaceChildren(...rows);
    }
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

StatusBar.bind(instance);
