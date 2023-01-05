import {
    Vector2,
    Vector3,
    Vector4,
    Raycaster,
    Color,
    BufferAttribute,
} from 'three';
import RenderingState from '../Renderer/RenderingState.js';
import { unpack1K } from '../Renderer/LayeredMaterial.js';
import Coordinates from './Geographic/Coordinates.js';
import DEMUtils from '../utils/DEMUtils.js';

function hideEverythingElse(instance, object, threejsLayer = 0) {
    // We want to render only 'object' and its hierarchy.
    // So if it uses threejsLayer defined -> force it on the camera
    // (or use the default one: 0)
    const prev = instance.camera.camera3D.layers.mask;

    instance.camera.camera3D.layers.mask = 1 << threejsLayer;

    return () => {
        instance.camera.camera3D.layers.mask = prev;
    };
}

function unpackHalfRGBA(v, target) {
    if (!target || !target.isVector2) {
        target = new Vector2();
    }
    return target.set(v.x + (v.y / 255.0), v.z + (v.w / 255.0));
}

const depthRGBA = new Vector4();

function renderTileBuffers(instance, map, coords, radius, filter) {
    const idFunc = data => {
        depthRGBA.fromArray(data).divideScalar(255.0);
        const unpack = unpack1K(depthRGBA, 256 ** 3);
        return Math.round(unpack);
    };

    const uvFunc = data => {
        depthRGBA.fromArray(data).divideScalar(255.0);
        return unpackHalfRGBA(depthRGBA);
    };

    const ids = renderTileBuffer(instance, map, coords, radius, RenderingState.ID, idFunc, filter);
    const uvs = renderTileBuffer(instance, map, coords, radius, RenderingState.UV, uvFunc, filter);

    return { ids, uvs };
}

function renderTileBuffer(instance, map, coords, radius, renderState, pixelFunc, filter) {
    const dim = instance.mainLoop.gfxEngine.getWindowSize();

    coords = coords || new Vector2(Math.floor(dim.x / 2), Math.floor(dim.y / 2));

    const restore = map.setRenderState(renderState);

    const undoHide = hideEverythingElse(instance, map.object3d, map.threejsLayer);

    const buffer = instance.mainLoop.gfxEngine.renderToBuffer(
        { camera: instance.camera, scene: map.object3d },
        {
            x: coords.x - radius,
            y: coords.y - radius,
            width: 1 + radius * 2,
            height: 1 + radius * 2,
        },
    );

    undoHide();

    restore();

    const result = [];

    traversePickingCircle(radius, (x, y, idx) => {
        if (filter) {
            const coord = {
                x: x + coords.x,
                y: y + coords.y,
                z: 0,
            };

            if (!filter(coord)) {
                return;
            }
        }

        const data = buffer.slice(idx * 4, idx * 4 + 4);

        const pixelValue = pixelFunc(data);

        result.push(pixelValue);
    });

    return result;
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

const raycaster = new Raycaster();
const tmpCoords = new Coordinates('EPSG:3857', 0, 0, 0);
const tmpColor = new Color();

/**
 * @module Picking
 *
 * Implement various picking methods for geometry layers.
 * These methods are not meant to be used directly, see Instance.pickObjectsAt
 * instead.
 *
 * All the methods here takes the same parameters:
 *   - the instance
 *   - canvas coordinates (in pixels) where picking should be done
 *   - radius (in pixels) of the picking circle
 *   - layer: the geometry layer used for picking
 */
export default {
    pickTilesAt: (_instance, canvasCoords, map, options = {}, target = []) => {
        const radius = options.radius || 0;
        const limit = options.limit || Infinity;
        const filterCanvas = options.filterCanvas;
        const filter = options.filter;

        const { ids, uvs } = renderTileBuffers(_instance, map, canvasCoords, radius, filterCanvas);

        const extent = map.extent;
        const crs = extent.crs();

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const uv = uvs[i];

            const tile = map.tileIndex.getTile(id);

            if (tile) {
                const ex = tile.extent;
                tmpCoords.set(
                    crs,
                    ex.west() + uv.x * (ex.east() - ex.west()),
                    ex.south() + uv.y * (ex.north() - ex.south()),
                    0,
                );

                const elevation = DEMUtils.getElevationValueAt(
                    map,
                    tmpCoords,
                    DEMUtils.FAST_READ_Z,
                    [tile],
                );

                if (elevation) {
                    tmpCoords._values[2] = elevation.z;
                    // convert to instance crs
                    // here (and only here) should be the Coordinates instance creation
                    const coord = tmpCoords.as(
                        _instance.referenceCrs,
                        new Coordinates(_instance.referenceCrs),
                    );

                    const point = tmpCoords.xyz(new Vector3());

                    const p = {
                        object: tile,
                        layer: map,
                        point,
                        coord,
                        distance: _instance.camera.camera3D.position.distanceTo(point),
                    };

                    if (!filter || filter(p)) {
                        target.push(p);

                        if (target.length >= limit) {
                            break;
                        }
                    }
                }
            }
        }

        return target;
    },

    pickPointsAt: (instance, canvasCoords, layer, options = {}, target = []) => {
        const radius = Math.floor(options.radius || 0);
        const limit = options.limit || Infinity;
        const filterCanvas = options.filterCanvas;
        const filter = options.filter;

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

        const undoHide = hideEverythingElse(instance, layer.object3d, layer.threejsLayer);

        // render 1 pixel
        const buffer = instance.mainLoop.gfxEngine.renderToBuffer(
            { camera: instance.camera, scene: layer.object3d },
            {
                x: Math.max(0, canvasCoords.x - radius),
                y: Math.max(0, canvasCoords.y - radius),
                width: 1 + radius * 2,
                height: 1 + radius * 2,
            },
        );

        undoHide();

        const candidates = [];

        traversePickingCircle(radius, (x, y, idx) => {
            const coord = {
                x: x + canvasCoords.x,
                y: y + canvasCoords.y,
                z: 0,
            };
            if (filterCanvas && !filterCanvas(coord)) {
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
                console.warn(`weird: pickingId (${pickingId}) > visibleId (${visibleId})`);
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

        layer.object3d.traverse(o => {
            if (o.isPoints && o.visible && o.material.visible) {
                for (let i = 0; i < candidates.length && target.length < limit; i++) {
                    if (candidates[i].pickingId === o.material.pickingId) {
                        const position = new Vector3()
                            .fromArray(
                                o.geometry.attributes.position.array, 3 * candidates[i].index,
                            )
                            .applyMatrix4(o.matrixWorld);
                        const p = {
                            object: o,
                            index: candidates[i].index,
                            layer,
                            point: position,
                            coord: candidates[i].coord,
                            distance: instance.camera.camera3D.position.distanceTo(position),
                        };
                        if (!filter || filter(p)) {
                            target.push(p);
                        }
                    }
                }
                // disable picking mode
                o.material.enablePicking(0);
            }
        });

        return target;
    },

    /*
     * Default picking method. Uses Raycaster
     */
    pickObjectsAt(instance, canvasCoords, object, options = {}, target = []) {
        const radius = options.radius || 0;
        const limit = options.limit || Infinity;
        const filterCanvas = options.filterCanvas;
        const filter = options.filter;
        const vec2 = options.vec2 || new Vector2();

        // Instead of doing N raycast (1 per x,y returned by traversePickingCircle),
        // we force render the zone of interest.
        // Then we'll only do raycasting for the pixels where something was drawn.
        const zone = {
            x: canvasCoords.x - radius,
            y: canvasCoords.y - radius,
            width: 1 + radius * 2,
            height: 1 + radius * 2,
        };
        const pixels = instance.mainLoop.gfxEngine.renderToBuffer(
            { scene: object, camera: instance.camera },
            zone,
        );

        const clearColor = instance.mainLoop.gfxEngine.renderer.getClearColor(tmpColor);
        const clearR = Math.round(255 * clearColor.r);
        const clearG = Math.round(255 * clearColor.g);
        const clearB = Math.round(255 * clearColor.b);

        // Raycaster use NDC coordinate
        const normalized = instance.canvasToNormalizedCoords(canvasCoords, vec2);
        const tmp = normalized.clone();
        traversePickingCircle(radius, (x, y) => {
            if (filterCanvas) {
                const coord = {
                    x: x + canvasCoords.x,
                    y: y + canvasCoords.y,
                    z: 0,
                };
                if (!filterCanvas(coord)) {
                    return null;
                }
            }

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
                return null;
            }

            // Perform raycasting
            tmp.setX(normalized.x + x / instance.camera.width)
                .setY(normalized.y + y / instance.camera.height);
            raycaster.setFromCamera(
                tmp,
                instance.camera.camera3D,
            );

            const intersects = raycaster.intersectObject(object, true);
            for (const inter of intersects) {
                inter.layer = findLayerInParent(inter.object);
                if (!filter || filter(inter)) {
                    target.push(inter);
                    if (target.length >= limit) return false;
                }
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
        pointsGeometry.setAttribute('unique_id', new BufferAttribute(ids, 4, true));
    },
};
