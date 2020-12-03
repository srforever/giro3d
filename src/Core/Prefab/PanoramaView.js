import * as THREE from 'three';

import Instance from '../instance.js';

import { GeometryLayer } from '../Layer/Layer.js';
import Extent from '../Geographic/Extent.js';
import PanoramaTileBuilder from './Panorama/PanoramaTileBuilder.js';
import ProjectionType from './Panorama/Constants.js';

export function createPanoramaLayer(id, coordinates, type, options = {}) {
    const tileLayer = new GeometryLayer(id, options.object3d || new THREE.Group());

    coordinates.xyz(tileLayer.object3d.position);
    tileLayer.object3d.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), coordinates.geodesicNormal,
    );
    tileLayer.object3d.updateMatrixWorld(true);

    // FIXME: add CRS = '0' support
    tileLayer.extent = new Extent('EPSG:4326', {
        west: -180,
        east: 180,
        north: 90,
        south: -90,
    });

    if (type === ProjectionType.SPHERICAL) {
        // equirectangular -> spherical geometry
        tileLayer.schemeTile = [
            new Extent('EPSG:4326', {
                west: -180,
                east: 0,
                north: 90,
                south: -90,
            }), new Extent('EPSG:4326', {
                west: 0,
                east: 180,
                north: 90,
                south: -90,
            })];
    } else if (type === ProjectionType.CYLINDRICAL) {
        // cylindrical geometry
        tileLayer.schemeTile = [
            new Extent('EPSG:4326', {
                west: -180,
                east: -90,
                north: 90,
                south: -90,
            }), new Extent('EPSG:4326', {
                west: -90,
                east: 0,
                north: 90,
                south: -90,
            }), new Extent('EPSG:4326', {
                west: 0,
                east: 90,
                north: 90,
                south: -90,
            }), new Extent('EPSG:4326', {
                west: 90,
                east: 180,
                north: 90,
                south: -90,
            })];
    } else {
        throw new Error(`Unsupported panorama projection type ${type}.
            Only ProjectionType.SPHERICAL and ProjectionType.CYLINDRICAL are supported`);
    }

    tileLayer.builder = new PanoramaTileBuilder(type, options.ratio);
    tileLayer.protocol = 'tile';
    tileLayer.visible = true;
    tileLayer.lighting = {
        enable: false,
        position: { x: -0.5, y: 0.0, z: 1.0 },
    };

    return tileLayer;
}

function PanoramaView(viewerDiv, coordinates, type, options = {}) {
    // Setup Instance
    Instance.call(this, viewerDiv, coordinates.crs, options);

    // Configure camera
    const camera = this.camera.camera3D;
    coordinates.xyz(camera.position);

    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 1000;
    camera.up = coordinates.geodesicNormal;
    // look at to the north
    camera.lookAt(new THREE.Vector3(0, 1, 0).add(camera.position));

    if (camera.updateProjectionMatrix) {
        camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();

    const tileLayer = createPanoramaLayer('panorama', coordinates, type, options);

    Instance.prototype.addLayer.call(this, tileLayer);

    this.baseLayer = tileLayer;
}

// TODO PanoramaView shouldn't subclass Instance
PanoramaView.prototype = Object.create(Instance.prototype);
PanoramaView.prototype.constructor = PanoramaView;

PanoramaView.prototype.addLayer = function addLayer(layer) {
    if (!layer) {
        return new Promise((resolve, reject) => reject(new Error('layer is undefined')));
    }
    if (layer.type !== 'color') {
        throw new Error(`Unsupported layer type ${layer.type} (PanoramaView only support 'color' layers)`);
    }
    return Instance.prototype.addLayer.call(this, layer, this.baseLayer);
};

export default PanoramaView;
