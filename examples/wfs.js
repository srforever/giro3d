import proj4 from 'proj4';
import { Vector3, Color } from 'three';
import FeatureProcessing from '../src/Process/FeatureProcessing.js';
import Feature2Mesh from '../src/Renderer/ThreeExtended/Feature2Mesh.js';
import Extent from '../src/Core/Geographic/Extent.js';
import Instance from '../src/Core/Instance.js';
import { Map } from '../src/entities/Map.js';
import { MAIN_LOOP_EVENTS } from '../src/Core/MainLoop.js';

// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
proj4.defs('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:2154',
    '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Define geographic extent: CRS, min/max X, min/max Y
const extent = new Extent(
    'EPSG:3946',
    1837816.94334, 1847692.32501,
    5170036.4587, 5178412.82698,
);

// `viewerDiv` will contain giro3d' rendering area (`<canvas>`)
const viewerDiv = document.getElementById('viewerDiv');

// Instantiate Giro3D
const instance = new Instance(viewerDiv, { crs: extent.crs() });
instance.mainLoop.gfxEngine.renderer.setClearColor(0x0a3b59);

const map = new Map('map', { extent });
map.disableSkirt = true;

instance.add(map);

// Add an WMS imagery layer (see WMSProvider* for valid options)
map.addLayer({
    url: 'https://download.data.grandlyon.com/wms/grandlyon',
    networkOptions: { crossOrigin: 'anonymous' },
    type: 'color',
    protocol: 'wms',
    version: '1.3.0',
    id: 'wms_imagery',
    name: 'Ortho2009_vue_ensemble_16cm_CC46',
    projection: 'EPSG:3946',
    transparent: false,
    extent,
    format: 'image/jpeg',
});

instance.camera.camera3D.position.set(1839739, 5171618, 910);
instance.camera.camera3D.lookAt(new Vector3(1840839, 5172718, 0));

function setMaterialLineWidth(result) {
    result.traverse(mesh => {
        if (mesh.material) {
            mesh.material.linewidth = 5;
        }
    });
}

function colorLine(properties) {
    const rgb = properties.couleur.split(' ');
    return new Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

map.addLayer({
    name: 'lyon_tcl_bus',
    update: FeatureProcessing.update,
    convert: Feature2Mesh.convert({ color: colorLine }),
    onMeshCreated: setMaterialLineWidth,
    url: 'https://download.data.grandlyon.com/wfs/rdata?',
    protocol: 'wfs',
    version: '2.0.0',
    id: 'tcl_bus',
    typeName: 'tcl_sytral.tcllignebus',
    level: 2,
    projection: 'EPSG:3946',
    extent: {
        west: 1822174.60,
        east: 1868247.07,
        south: 5138876.75,
        north: 5205890.19,
    },
    format: 'geojson',
});

function colorBuildings(properties) {
    if (properties.id.indexOf('bati_remarquable') === 0) {
        return new Color(0x5555ff);
    } if (properties.id.indexOf('bati_industriel') === 0) {
        return new Color(0xff5555);
    }
    return new Color(0xeeeeee);
}

function extrudeBuildings(properties) {
    return properties.hauteur;
}

let meshes = [];
function scaler(/* dt */) {
    let i;
    let mesh;
    if (meshes.length) {
        instance.notifyChange();
    }
    for (i = 0; i < meshes.length; i++) {
        mesh = meshes[i];
        mesh.scale.z = Math.min(
            1.0, mesh.scale.z + 0.016,
        );
        mesh.updateMatrixWorld(true);
    }
    meshes = meshes.filter(m => m.scale.z < 1);
}

instance.addFrameRequester(MAIN_LOOP_EVENTS.BEFORE_RENDER, scaler);

map.addLayer({
    type: 'geometry',
    update: FeatureProcessing.update,
    convert: Feature2Mesh.convert({
        color: colorBuildings,
        extrude: extrudeBuildings,
    }),
    onMeshCreated: function scaleZ(mesh) {
        mesh.scale.z = 0.01;
        meshes.push(mesh);
    },
    url: 'http://wxs.ign.fr/72hpsel8j8nhb5qgdh07gcyp/geoportail/wfs?',
    networkOptions: { crossOrigin: 'anonymous' },
    protocol: 'wfs',
    version: '2.0.0',
    id: 'wfsBuilding',
    typeName: 'BDTOPO_BDD_WLD_WGS84G:bati_remarquable,BDTOPO_BDD_WLD_WGS84G:bati_indifferencie,BDTOPO_BDD_WLD_WGS84G:bati_industriel',
    level: 5,
    projection: 'EPSG:4326',
    extent: {
        west: 4.568,
        east: 5.18,
        south: 45.437,
        north: 46.03,
    },
    ipr: 'IGN',
    format: 'application/json',
});

function configPointMaterial(result) {
    let i = 0;
    let mesh;
    for (; i < result.children.length; i++) {
        mesh = result.children[i];

        mesh.material.size = 15;
        mesh.material.sizeAttenuation = false;
    }
}

function colorPoint(properties) {
    if (properties.gestion === 'CEREMA') {
        return new Color(0x7F180D);
    }
    return new Color(0xFFB300);
}

map.addLayer({
    type: 'geometry',
    update: FeatureProcessing.update,
    convert: Feature2Mesh.convert({
        altitude: 0,
        color: colorPoint,
    }),
    onMeshCreated: configPointMaterial,
    url: 'http://wxs.ign.fr/72hpsel8j8nhb5qgdh07gcyp/geoportail/wfs?',
    networkOptions: { crossOrigin: 'anonymous' },
    protocol: 'wfs',
    version: '2.0.0',
    id: 'wfsPoint',
    typeName: 'BDPR_BDD_FXX_LAMB93_20170911:pr',
    level: 2,
    projection: 'EPSG:2154',
    ipr: 'IGN',
    format: 'application/json',
});

/* global, document, window, view */
function picking(event) {
    const htmlInfo = document.getElementById('info');
    const intersects = instance.pickObjectsAt(event, 2, 'wfsBuilding');
    let properties;
    let info;
    htmlInfo.innerHTML = ' ';

    if (intersects.length) {
        properties = intersects[0].object.properties;
        Object.keys(properties).forEach(objectKey => {
            const value = properties[objectKey];
            const key = objectKey.toString();
            if (key[0] !== '_' && key !== 'geometry_name') {
                info = value.toString();
                htmlInfo.innerHTML += `<li><b>${key}: </b>${info}</li>`;
            }
        });
        return intersects[0].object;
    }

    return undefined;
}

window.addEventListener('mousemove', picking, false);

// Request redraw
instance.notifyChange();
