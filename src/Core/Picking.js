import * as THREE from 'three';
import TileMesh from './TileMesh.js';
import RendererConstant from '../Renderer/RendererConstant.js';
import { unpack1K } from '../Renderer/LayeredMaterial.js';
import Coordinates from './Geographic/Coordinates.js';
import DEMUtils from '../utils/DEMUtils.js';

function hideEverythingElse(view, object, threejsLayer = 0) {
    // We want to render only 'object' and its hierarchy.
    // So if it uses threejsLayer defined -> force it on the camera
    // (or use the default one: 0)
    const prev = view.camera.camera3D.layers.mask;

    view.camera.camera3D.layers.mask = 1 << threejsLayer;

    return () => {
        view.camera.camera3D.layers.mask = prev;
    };
}

function unpackHalfRGBA(v, target) {
    if (!target || !target.isVector2) {
        target = new THREE.Vector2();
    }
    return target.set(v.x + (v.y / 255.0), v.z + (v.w / 255.0));
}

const depthRGBA = new THREE.Vector4();
// TileMesh picking support function
function screenCoordsToNodeId(view, tileLayer, viewCoords, radius) {
    const dim = view.mainLoop.gfxEngine.getWindowSize();

    viewCoords = viewCoords || new THREE.Vector2(Math.floor(dim.x / 2), Math.floor(dim.y / 2));

    const restore = tileLayer.level0Nodes.map(n => n.pushRenderState(RendererConstant.ID));

    const undoHide = hideEverythingElse(view, tileLayer.object3d, tileLayer.threejsLayer);

    const buffer = view.mainLoop.gfxEngine.renderViewToBuffer(
        { camera: view.camera, scene: tileLayer.object3d },
        {
            x: viewCoords.x - radius,
            y: viewCoords.y - radius,
            width: 1 + radius * 2,
            height: 1 + radius * 2,
        },
    );

    undoHide();

    restore.forEach(r => r());

    const ids = [];

    traversePickingCircle(radius, (x, y, idx) => {
        const data = buffer.slice(idx * 4, idx * 4 + 4);
        depthRGBA.fromArray(data).divideScalar(255.0);
        const unpack = unpack1K(depthRGBA, 256 ** 3);

        const _id = Math.round(unpack);
        if (ids.indexOf(_id) < 0) {
            ids.push(_id);
        }
    });
    return ids;
}

function traversePickingCircle(radius, callback) {
    // iterate on radius so we get closer to the mouse
    // results first.
    // Result traversal order for radius=2
    // --3--
    // -323-
    // 32123
    // -323
    // --3--
    let prevSq;
    for (let r = 0; r <= radius; r++) {
        const sq = r * r;
        for (let x = -r; x <= r; x++) {
            const sqx = x * x;
            for (let y = -r; y <= r; y++) {
                const dist = sqx + y * y;
                // skip if too far
                if (dist > sq) {
                    continue;
                }
                // skip if belongs to previous
                if (dist <= prevSq) {
                    continue;
                }

                const realX = radius + x;
                const realY = radius + y;
                const idx = realY * (2 * radius) + realX;
                if (callback(realX, realY, idx) === false) {
                    return;
                }
            }
        }
        prevSq = sq;
    }
}

function findLayerInParent(obj) {
    if (obj.layer) {
        return obj.layer;
    }
    if (obj.parent) {
        return findLayerInParent(obj.parent);
    }
    return null;
}

const raycaster = new THREE.Raycaster();
const tmpCoords = new Coordinates('EPSG:3857', 0, 0, 0);

/**
 * @module Picking
 *
 * Implement various picking methods for geometry layers.
 * These methods are not meant to be used directly, see Instance.pickObjectsAt
 * instead.
 *
 * All the methods here takes the same parameters:
 *   - the instance
 *   - view coordinates (in pixels) where picking should be done
 *   - radius (in pixels) of the picking circle
 *   - layer: the geometry layer used for picking
 */
export default {
    pickTilesAt: (_instance, viewCoords, radius, layer) => {
        const results = [];
        // TODO is there a way to get the node id AND uv on the same render pass ?
        // We would need to get a upper bound to the tile ids, and not use the three.js uuid
        // We need to assess how much precision will be left for the uv, and if it is acceptable
        // do we really gain something, considering the fact that render in UV
        // mode will be fast (we only render one object) ?
        const _ids = screenCoordsToNodeId(_instance, layer, viewCoords, radius);

        const extractResult = node => {
            // for each node (normally no more than 4 of them) we do a render
            // in UV mode to get the uv under the mouse. This'll give us the
            // x,y coordinates, and we use DEMUtils to get z (normally no
            // render needed, but maybe a draw on canvas ? Check that).
            if (_ids.indexOf(node.id) >= 0 && node instanceof TileMesh) {
                const restore = node.pushRenderState(RendererConstant.UV);
                const buffer = _instance.mainLoop.gfxEngine.renderViewToBuffer(
                    { camera: _instance.camera, scene: node },
                    {
                        x: Math.max(0, viewCoords.x - radius),
                        y: Math.max(0, viewCoords.y - radius),
                        width: 1 + radius * 2,
                        height: 1 + radius * 2,
                    },
                );
                const uvs = [];
                traversePickingCircle(radius, (x, y, idx) => {
                    const data = buffer.slice(idx * 4, idx * 4 + 4);
                    depthRGBA.fromArray(data).divideScalar(255.0);
                    uvs.push(unpackHalfRGBA(depthRGBA));
                });
                // Reconstruct position from uv
                for (const uv of uvs) {
                    tmpCoords.set(layer.extent.crs(),
                        // TODO this looks a lot like PlanarTileBuilder.uProjecte
                        node.extent.west() + uv.x * (node.extent.east() - node.extent.west()),
                        node.extent.south() + uv.y * (node.extent.north() - node.extent.south()),
                        0);
                    const result = DEMUtils.getElevationValueAt(
                        layer, tmpCoords, DEMUtils.FAST_READ_Z, [node],
                    );
                    if (result) {
                        tmpCoords._values[2] = result.z;
                        // convert to view crs
                        // here (and only here) should be the Coordinates instance creation
                        const coord = tmpCoords.as(
                            _instance.referenceCrs, new Coordinates(_instance.referenceCrs),
                        );
                        const point = tmpCoords.xyz(new THREE.Vector3());
                        results.push({
                            object: node,
                            layer,
                            point,
                            coord,
                            distance: _instance.camera.camera3D.position.distanceTo(point),
                        });
                    }
                }
                restore();
            }
        };
        for (const n of layer.level0Nodes) {
            n.traverse(extractResult);
        }
        return results;
    },

    pickPointsAt: (view, viewCoords, radius, layer, filter) => {
        radius = Math.floor(radius);

        // Enable picking mode for points material, by assigning
        // a unique id to each Points instance.
        let visibleId = 1;
        // 12 bits reserved for the ids (= 4096 instances)
        const maxVisibleId = 1 << 12;
        layer.object3d.traverse(o => {
            if (o.isPoints && o.visible && o.material.visible && o.material.enablePicking) {
                o.material.enablePicking(visibleId++);

                if (visibleId === maxVisibleId) {
                    console.warn('Too much visible point instance. The next one won\'t be pickable');
                }
            }
        });

        const undoHide = hideEverythingElse(view, layer.object3d, layer.threejsLayer);

        // render 1 pixel
        const buffer = view.mainLoop.gfxEngine.renderViewToBuffer(
            { camera: view.camera, scene: layer.object3d },
            {
                x: Math.max(0, viewCoords.x - radius),
                y: Math.max(0, viewCoords.y - radius),
                width: 1 + radius * 2,
                height: 1 + radius * 2,
            },
        );

        undoHide();

        const candidates = [];

        traversePickingCircle(radius, (x, y, idx) => {
            const coord = {
                x: x + viewCoords.x,
                y: y + viewCoords.y,
                z: 0,
            };
            if (filter && !filter(coord)) {
                return;
            }

            if (idx * 4 < 0 || ((idx + 1) * 4) > buffer.length) {
                console.error('azadaz');
            }

            const data = buffer.slice(idx * 4, idx * 4 + 4);

            if (data[0] === 255 && data[1] === 255) {
                return;
            }
            // 12 first bits (so data[0] and half of data[1]) = pickingId
            const pickingId = data[0] + ((data[1] & 0xf0) << 4);

            if (pickingId > visibleId) {
                console.warn('weird');
                console.warn(pickingId);
            }
            // the remaining 20 bits = the point index
            const index = ((data[1] & 0x0f) << 16) + (data[2] << 8) + data[3];

            const r = {
                pickingId,
                index,
                coord,
            };

            // filter already if already present
            for (let i = 0; i < candidates.length; i++) {
                if (candidates[i].pickingId === r.pickingId && candidates[i].index === r.index) {
                    return;
                }
            }

            candidates.push(r);
        });

        const result = [];
        layer.object3d.traverse(o => {
            if (o.isPoints && o.visible && o.material.visible) {
                for (let i = 0; i < candidates.length; i++) {
                    if (candidates[i].pickingId === o.material.pickingId) {
                        const position = new THREE.Vector3()
                            .fromArray(
                                o.geometry.attributes.position.array, 3 * candidates[i].index,
                            )
                            .applyMatrix4(o.matrixWorld);
                        result.push({
                            object: o,
                            index: candidates[i].index,
                            layer,
                            point: position,
                            coord: candidates[i].coord,
                            distance: view.camera.camera3D.position.distanceTo(position),
                        });
                    }
                }
                // disable picking mode
                o.material.enablePicking(0);
            }
        });

        return result;
    },

    /*
     * Default picking method. Uses THREE.Raycaster
     */
    pickObjectsAt(view, viewCoords, radius, object, target = []) {
        // Instead of doing N raycast (1 per x,y returned by traversePickingCircle),
        // we force render the zone of interest.
        // Then we'll only do raycasting for the pixels where something was drawn.
        const zone = {
            x: viewCoords.x - radius,
            y: viewCoords.y - radius,
            width: 1 + radius * 2,
            height: 1 + radius * 2,
        };
        const pixels = view.mainLoop.gfxEngine.renderViewToBuffer(
            { scene: object, camera: view.camera },
            zone,
        );

        const clearColor = view.mainLoop.gfxEngine.renderer.getClearColor();
        const clearR = Math.round(255 * clearColor.r);
        const clearG = Math.round(255 * clearColor.g);
        const clearB = Math.round(255 * clearColor.b);

        // Raycaster use NDC coordinate
        const normalized = view.viewToNormalizedCoords(viewCoords);
        const tmp = normalized.clone();
        traversePickingCircle(radius, (x, y) => {
            // x, y are offset from the center of the picking circle,
            // and pixels is a square where 0, 0 is the top-left corner.
            // So we need to shift x,y by radius.
            const xi = x + radius;
            const yi = y + radius;
            const offset = (yi * (radius * 2 + 1) + xi) * 4;
            const r = pixels[offset];
            const g = pixels[offset + 1];
            const b = pixels[offset + 2];
            // Use approx. test to avoid rounding error or to behave
            // differently depending on hardware rounding mode.
            if (Math.abs(clearR - r) <= 1
                && Math.abs(clearG - g) <= 1
                && Math.abs(clearB - b) <= 1) {
                // skip because nothing has been rendered here
                return false;
            }

            // Perform raycasting
            tmp.setX(normalized.x + x / view.camera.width)
                .setY(normalized.y + y / view.camera.height);
            raycaster.setFromCamera(
                tmp,
                view.camera.camera3D,
            );

            const intersects = raycaster.intersectObject(object, true);
            for (const inter of intersects) {
                inter.layer = findLayerInParent(inter.object);
                target.push(inter);
            }

            // Stop at first hit
            return target.length === 0;
        });

        return target;
    },

    preparePointGeometryForPicking: pointsGeometry => {
        // generate unique id for picking
        const numPoints = pointsGeometry.attributes.position.count;
        // reserve 12 bits for the entity id
        if (numPoints >= (1 << 20)) {
            console.warn(`picking issue: only ${1 << 20} points per Points object supported`);
        }
        const ids = new Uint8Array(4 * numPoints);
        for (let i = 0; i < numPoints; i++) {
            ids[4 * i + 0] = 0;
            ids[4 * i + 1] = (i & 0x000f0000) >> 16;
            ids[4 * i + 2] = (i & 0x0000ff00) >> 8;
            ids[4 * i + 3] = (i & 0x000000ff) >> 0;
        }
        pointsGeometry.setAttribute('unique_id', new THREE.BufferAttribute(ids, 4, true));
    },
};
