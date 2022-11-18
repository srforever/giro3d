/**
 * @module helpers/Helpers
 */
import {
    Color,
    Object3D,
    Box3,
    Vector3,
    BoxHelper,
    Box3Helper,
    BufferGeometry,
    BufferAttribute,
    LineBasicMaterial,
    LineSegments,
    SphereGeometry,
    Mesh,
    Matrix4,
    MeshBasicMaterial,
    AxesHelper,
    GridHelper,
} from 'three';
import Tiles3D from '../entities/Tiles3D.js';
import OBB from '../Renderer/ThreeExtended/OBB.js';
import OBBHelper from './OBBHelper.js';

const _vector = new Vector3();
const invMatrixChangeUpVectorZtoY = new Matrix4().makeRotationX(Math.PI / 2).invert();
const invMatrixChangeUpVectorZtoX = new Matrix4().makeRotationZ(-Math.PI / 2).invert();

/**
 * @param {Color|string} colorDesc A THREE color or hex string.
 * @returns {Color} The THREE color.
 */
function getColor(colorDesc) {
    if (colorDesc instanceof String) {
        return new Color(colorDesc);
    }

    return colorDesc;
}

function create3dTileRegion(region, color) {
    const helper = new OBBHelper(region, color);
    helper.isvolumeHelper = true;
    helper.position.copy(region.position);
    helper.rotation.copy(region.rotation);
    return helper;
}

/**
 * This function creates a Box3 by matching the object's bounding box,
 * without including its children.
 *
 * @param {Object3D} object The object to expand.
 * @param {boolean} precise If true, the computation uses the vertices from the geometry.
 * @returns {Box3} The expanded box.
 */
function makeLocalBbox(object, precise = false) {
    // The object provides a specific bounding box
    if (object.OBB) {
        const obb = object.OBB();
        return obb.box3D;
    }

    const box = new Box3();

    const geometry = object.geometry;

    if (geometry !== undefined) {
        if (precise && geometry.attributes !== undefined
            && geometry.attributes.position !== undefined) {
            const position = geometry.attributes.position;
            for (let i = 0, l = position.count; i < l; i++) {
                _vector.fromBufferAttribute(position, i);
                box.expandByPoint(_vector);
            }
        } else {
            if (geometry.boundingBox === null) {
                geometry.computeBoundingBox();
            }

            box.copy(geometry.boundingBox);
        }
    }

    return box;
}

function createBoxHelper(box, color) {
    const helper = new Box3Helper(box, color);
    helper.name = 'bounding box';
    helper.isHelper = true;
    helper.isvolumeHelper = true;
    helper.material.transparent = true;
    return helper;
}

const unitBoxMesh = (function _() {
    const indices = new Uint16Array(
        [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7],
    );
    const positions = new Float32Array(8 * 3);
    new Vector3(+0.5, +0.5, +0.5).toArray(positions, 0);
    new Vector3(-0.5, +0.5, +0.5).toArray(positions, 3);
    new Vector3(-0.5, -0.5, +0.5).toArray(positions, 6);
    new Vector3(+0.5, -0.5, +0.5).toArray(positions, 9);
    new Vector3(+0.5, +0.5, -0.5).toArray(positions, 12);
    new Vector3(-0.5, +0.5, -0.5).toArray(positions, 15);
    new Vector3(-0.5, -0.5, -0.5).toArray(positions, 18);
    new Vector3(+0.5, -0.5, -0.5).toArray(positions, 21);
    const geometry = new BufferGeometry();
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.setAttribute('position', new BufferAttribute(positions, 3));

    return function _unitBoxMesh(color) {
        const material = new LineBasicMaterial({
            color,
            linewidth: 3,
        });

        const box = new LineSegments(geometry, material);
        box.frustumCulled = false;
        return box;
    };
}());

/**
 * @param {Box3} box The box.
 * @param {Color} color The color.
 */
function createBoxVolume(box, color) {
    const helper = unitBoxMesh(color);
    helper.scale.copy(box.getSize(_vector));
    box.getCenter(helper.position);
    return helper;
}

function createSphereVolume(sphere, color) {
    const geometry = new SphereGeometry(
        sphere.radius, 32, 32,
    );
    const material = new MeshBasicMaterial({ wireframe: true, color });
    const helper = new Mesh(geometry, material);
    helper.position.copy(sphere.center);
    helper.isHelper = true;
    return helper;
}

/**
 * Provides utility functions to create scene helpers, such as bounding boxes, grids, axes...
 *
 * @api
 */
class Helpers {
    /**
     * Adds a bounding box helper to the object.
     * If a bounding box is already present, it is updated instead.
     *
     * @static
     * @api
     * @param {Object3D} obj The object to decorate.
     * @param {Color|string} color The color.
     * @example
     * // add a bounding box to 'obj'
     * Helpers.addBoundingBox(obj, 'green');
     */
    static addBoundingBox(obj, color) {
        // Don't add a bounding box helper to a bounding box helper !
        if (obj.isvolumeHelper) {
            return;
        }
        if (obj.volumeHelper) {
            obj.volumeHelper.updateMatrixWorld(true);
        } else {
            const helper = createBoxHelper(makeLocalBbox(obj), getColor(color));
            obj.add(helper);
            obj.volumeHelper = helper;
            helper.updateMatrixWorld(true);
        }
    }

    /**
     * Creates a selection bounding box helper around the specified object.
     *
     * @static
     * @api
     * @param {Object3D} obj The object to decorate.
     * @param {Color|string} color The color.
     * @returns {BoxHelper} the created box helper.
     * @example
     * // add a bounding box to 'obj'
     * Helpers.createSelectionBox(obj, 'green');
     */
    static createSelectionBox(obj, color) {
        const helper = createBoxHelper(makeLocalBbox(obj), getColor(color));
        obj.selectionHelper = helper;
        obj.add(helper);
        obj.updateMatrixWorld(true);
        return helper;
    }

    /**
     * Adds an oriented bounding box (OBB) helper to the object.
     * If a bounding box is already present, it is updated instead.
     *
     * @static
     * @api
     * @param {Object3D} obj The object to decorate.
     * @param {OBB} obb The OBB.
     * @param {Color|string} color The color.
     * @example
     * // add an OBB to 'obj'
     * Helpers.addOBB(obj, obj.OBB(), 'green');
     */
    static addOBB(obj, obb, color) {
        if (obj.volumeHelper) {
            obj.volumeHelper.update(obb);
        } else {
            const helper = new OBBHelper(obb, color);
            helper.name = 'OBBHelper';
            obj.add(helper);
            obj.volumeHelper = helper;
            helper.updateMatrixWorld(true);
        }
    }

    static removeOBB(obj) {
        if (obj.volumeHelper) {
            obj.volumeHelper.parent.remove(obj.volumeHelper);
            obj.volumeHelper.dispose();
            delete obj.volumeHelper;
        }
    }

    /**
     * Creates a bounding volume helper to the 3D Tile object and returns it.
     * The bounding volume can contain a sphere, a region, or a box.
     *
     * @static
     * @api
     * @param {Tiles3D} entity The entity.
     * @param {Object3D} obj The object to decorate.
     * @param {object} metadata The tile metadata
     * @param {string} metadata.magic The tile metadata magic number.
     * @param {object} metadata.boundingVolume The bounding volume.
     * @param {object} metadata.boundingVolume.region The bounding volume region.
     * @param {Vector3} metadata.boundingVolume.region.position The region position.
     * @param {Vector3} metadata.boundingVolume.region.rotation The region rotation.
     * @param {object} metadata.boundingVolume.sphere The bounding volume sphere.
     * @param {number} metadata.boundingVolume.sphere.radius The sphere radius.
     * @param {Vector3} metadata.boundingVolume.sphere.center The sphere center.
     * @param {Box3} metadata.boundingVolume.box The bounding volume box.
     * @param {Color|string} color The color.
     * @returns {object|null} The helper object, or null if it could not be created.
     * @example
     * // add a bounding box to 'obj'
     * Helpers.create3DTileBoundingVolume(entity, obj, volume, 'green');
     */
    static create3DTileBoundingVolume(entity, obj, metadata, color) {
        if (obj.boundingVolumeHelper) {
            obj.boundingVolumeHelper.object3d.visible = obj.visible;
            return obj.boundingVolumeHelper;
        }

        color = getColor(color);
        let object3d;
        let absolute = false;
        const { boundingVolume } = metadata;

        if (boundingVolume.region) {
            object3d = create3dTileRegion(boundingVolume.region, color);
            // regions have worldspace (absolute) positions,
            // they should not be attached to the tile object.
            absolute = true;
        } else if (boundingVolume.box) {
            object3d = createBoxVolume(boundingVolume.box, color);
        } else if (boundingVolume.sphere) {
            object3d = createSphereVolume(boundingVolume.sphere, color);
        }

        if (object3d
            && (metadata.magic === 'b3dm' || metadata.magic === 'i3dm')
            && !boundingVolume.region) {
            // compensate B3dm orientation correction
            const { gltfUpAxis } = entity.asset;
            object3d.updateMatrix();
            if (gltfUpAxis === undefined || gltfUpAxis === 'Y') {
                object3d.matrix.premultiply(invMatrixChangeUpVectorZtoY);
            } else if (gltfUpAxis === 'X') {
                object3d.matrix.premultiply(invMatrixChangeUpVectorZtoX);
            }
            object3d.applyMatrix4(new Matrix4());
        }

        if (object3d) {
            object3d.name = `${obj.name} volume`;
            const result = { object3d, absolute };
            obj.boundingVolumeHelper = result;
            return result;
        }

        return null;
    }

    /**
     * Create a grid on the XZ plane.
     *
     * @api
     * @static
     * @param {Vector3} origin The grid origin.
     * @param {number} size The size of the grid.
     * @param {number} subdivs The number of grid subdivisions.
     */
    static createGrid(origin, size, subdivs) {
        const grid = new GridHelper(size, subdivs);
        grid.name = 'grid';

        // Rotate the grid to be in the XZ plane.
        grid.rotateX(Math.PI / 2);
        grid.position.copy(origin);
        grid.updateMatrixWorld();

        return grid;
    }

    /**
     * Create an axis helper.
     *
     * @api
     * @static
     * @param {number} size The size of the helper.
     */
    static createAxes(size) {
        const axes = new AxesHelper(size);
        // We want the axes to be always visible,
        // and rendered on top of any other object in the scene.
        axes.renderOrder = 9999;
        axes.material.depthTest = false;
        return axes;
    }

    static remove3DTileBoundingVolume(obj) {
        if (obj.boundingVolumeHelper) {
            // The helper is not necessarily attached to the object, in the
            // case of helpers with absolute position.
            obj.boundingVolumeHelper.object3d.parent.remove(obj.boundingVolumeHelper.object3d);
            obj.boundingVolumeHelper.dispose();
            delete obj.boundingVolumeHelper;
        }
    }

    static update3DTileBoundingVolume(obj, properties) {
        if (!obj.boundingVolumeHelper) {
            return;
        }
        if (properties.color) {
            obj.boundingVolumeHelper.object3d.material.color = properties.color;
        }
    }

    /**
     * Removes an existing bounding box from the object, if any.
     *
     * @static
     * @api
     * @param {Object3D} obj The object to update.
     * @example
     * Helpers.removeBoundingBox(obj);
     */
    static removeBoundingBox(obj) {
        if (obj.volumeHelper) {
            obj.remove(obj.volumeHelper);
            obj.volumeHelper.dispose();
            delete obj.volumeHelper;
        }
    }
}

export default Helpers;
