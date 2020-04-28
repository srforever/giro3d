import * as THREE from 'three';
import OBB from '../../../Renderer/ThreeExtended/OBB.js';
import Coordinates from '../../Geographic/Coordinates.js';
import ProjectionType from './Constants.js';
import Extent from '../../Geographic/Extent.js';

function PanoramaTileBuilder(type, ratio) {
    this.tmp = {
        coords: new Coordinates('EPSG:4326', 0, 0),
        position: new THREE.Vector3(),
    };

    if (type === undefined) {
        throw new Error('Projection type must be defined');
    }
    if (type === ProjectionType.SPHERICAL) {
        this.type = 's';
        this.radius = 100;
    } else if (type === ProjectionType.CYLINDRICAL) {
        if (!ratio) {
            throw new Error('Image ratio must be defined when using cylindrical projection');
        }
        this.type = 'c';
        this.height = 200;
        this.radius = (ratio * this.height) / (2 * Math.PI);
    } else {
        throw new Error(`Unsupported panorama projection type ${type}`);
    }
    this.projectionType = type;
}

PanoramaTileBuilder.prototype.constructor = PanoramaTileBuilder;

// prepare params
// init projected object -> params.projected
PanoramaTileBuilder.prototype.Prepare = function Prepare(params) {
    if (this.projectionType === ProjectionType.SPHERICAL) {
        params.projected = {
            theta: 0,
            phi: 0,
            radius: this.radius,
        };
    } else {
        params.projected = {
            theta: 0,
            radius: this.radius,
            y: 0,
        };
    }
};

PanoramaTileBuilder.prototype.Center = function Center(extent) {
    const params = { extent };
    this.Prepare(params);
    this.uProjecte(0.5, params);
    this.vProjecte(0.5, params);

    return new THREE.Vector3(0, 0, 0);
};

// get position 3D cartesian
PanoramaTileBuilder.prototype.VertexPosition = function VertexPosition(params) {
    if (this.projectionType === ProjectionType.SPHERICAL) {
        this.tmp.position.setFromSpherical(params.projected);
    } else {
        this.tmp.position.setFromCylindrical(params.projected);
    }

    this.tmp.position.set(this.tmp.position.z, this.tmp.position.x, this.tmp.position.y);

    return this.tmp.position;
};

// coord u tile to projected
PanoramaTileBuilder.prototype.uProjecte = function uProjecte(u, params) {
    // both (theta, phi) and (y, z) are swapped in setFromSpherical
    params.projected.theta = THREE.MathUtils.degToRad(90 - THREE.MathUtils.lerp(
        params.extent.east(),
        params.extent.west(),
        1 - u,
    ));
};

// coord v tile to projected
PanoramaTileBuilder.prototype.vProjecte = function vProjecte(v, params) {
    if (this.projectionType === ProjectionType.SPHERICAL) {
        params.projected.phi = THREE.MathUtils.degToRad(90
            - THREE.MathUtils.lerp(
                params.extent.north(),
                params.extent.south(),
                1 - v,
            ));
    } else {
        params.projected.y = this.height
            * THREE.MathUtils.lerp(params.extent.south(), params.extent.north(), v) / 180;
    }
};

// get oriented bounding box of tile
PanoramaTileBuilder.prototype.OBB = function _OBB(boundingBox) {
    return new OBB(boundingBox.min, boundingBox.max);
};

const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);
const quatToAlignLongitude = new THREE.Quaternion();
const quatToAlignLatitude = new THREE.Quaternion();

PanoramaTileBuilder.prototype.computeSharableExtent = function fnComputeSharableExtent(extent) {
    // Compute sharable extent to pool the geometries
    // the geometry in common extent is identical to the existing input
    // with a transformation (translation, rotation)
    const sizeLongitude = Math.abs(extent.west() - extent.east()) / 2;
    const sharableExtent = new Extent(
        extent.crs(), -sizeLongitude, sizeLongitude, extent.south(), extent.north(),
    );

    // compute rotation to transform tile to position it
    // this transformation take into account the transformation of the parents
    const rotLon = extent.west() - sharableExtent.west();
    const rotLat = this.projectionType === ProjectionType.CYLINDRICAL
        ? 90 : 90 - ((extent.north() + extent.south()) * 0.5);
    quatToAlignLongitude.setFromAxisAngle(axisZ, -THREE.MathUtils.degToRad(rotLon));
    quatToAlignLatitude.setFromAxisAngle(axisY, -THREE.MathUtils.degToRad(rotLat));
    // quatToAlignLongitude.multiply(quatToAlignLatitude);

    return {
        sharableExtent,
        quaternion: quatToAlignLongitude.clone(),
        position: this.Center(sharableExtent),
    };
};

export default PanoramaTileBuilder;
