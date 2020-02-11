import * as THREE from 'three';
import Extent from '../Core/Geographic/Extent';
import ScreenSpaceError from '../Core/ScreenSpaceError';

const tmp = {
    v: new THREE.Vector3(),
    b: new THREE.Box3(),
    s: new THREE.Sphere(),
};

function requestNewTile(view, scheduler, layer, metadata, parent, redraw) {
    if (metadata.obj) {
        unmarkForDeletion(layer, metadata.obj);
        view.notifyChange(parent);
        return Promise.resolve(metadata.obj);
    }

    let priority;
    if (!parent || parent.additiveRefinement) {
        // Additive refinement can be done independently for each child,
        // so we can compute a per child priority
        const size = metadata.boundingVolume.box.clone()
            .applyMatrix4(metadata._worldFromLocalTransform)
            .getSize(tmp.v);
        priority = size.x * size.y;
    } else {
        // But the 'replace' refinement needs to download all children at
        // the same time.
        // If one of the children is very small, its priority will be low,
        // and it will delay the display of its siblings.
        // So we compute a priority based on the size of the parent
        // TODO cache the computation of world bounding volume ?
        const size = parent.boundingVolume.box.clone()
            .applyMatrix4(parent.matrixWorld)
            .getSize(tmp.v);
        priority = size.x * size.y;// / layer.tileIndex.index[parent.tileId].children.length;
    }

    const command = {
        /* mandatory */
        view,
        requester: parent,
        layer,
        priority,
        /* specific params */
        metadata,
        redraw,
        earlyDropFunction: cmd =>
            cmd.requester && (
                // requester cleaned
                !cmd.requester.parent ||
                // requester not visible anymore
                !cmd.requester.visible ||
                // requester visible but doesn't need subdivision anymore
                cmd.requester.sse < cmd.layer.sseThreshold),
    };

    if (metadata.content) {
        const path = metadata.content.url || metadata.content.uri;
        const url = path.startsWith('http') ? path : metadata.baseURL + path;

        command.toDownload = { url };
    }

    return scheduler.execute(command).then(
        node => {
            metadata.obj = node;
            return node;
        });
}

function getChildTiles(tile) {
    // only keep children that have the same layer and a valid tileId
    return tile.children.filter(n => n.layer == tile.layer && n.tileId);
}

function subdivideNode(context, layer, node, cullingTest) {
    if (node.additiveRefinement) {
        // Additive refinement can only fetch visible children.
        _subdivideNodeAdditive(context, layer, node, cullingTest);
    } else {
        // Substractive refinement on the other hand requires to replace
        // node with all of its children
        _subdivideNodeSubstractive(context, layer, node);
    }
}

function boundingVolumeToExtent(crs, volume, transform) {
    if (volume.region) {
        return new Extent('EPSG:4326',
            THREE.Math.radToDeg(volume.region[0]),
            THREE.Math.radToDeg(volume.region[2]),
            THREE.Math.radToDeg(volume.region[1]),
            THREE.Math.radToDeg(volume.region[3]));
    } else if (volume.box) {
        const box = tmp.b.copy(volume.box).applyMatrix4(transform);
        return Extent.fromBox3(crs, box);
    } else {
        const sphere = tmp.s.copy(volume.sphere).applyMatrix4(transform);
        return new Extent(crs, {
            west: sphere.center.x - sphere.radius,
            east: sphere.center.x + sphere.radius,
            south: sphere.center.y - sphere.radius,
            north: sphere.center.y + sphere.radius,
        });
    }
}

const tmpMatrix = new THREE.Matrix4();
function _subdivideNodeAdditive(context, layer, node, cullingTest) {
    for (const child of layer.tileIndex.index[node.tileId].children) {
        // child being downloaded or already added => skip
        if (child.promise || node.children.filter(n => n.tileId == child.tileId).length > 0) {
            continue;
        }

        // 'child' is only metadata (it's *not* a THREE.Object3D). 'cullingTest' needs
        // a matrixWorld, so we compute it: it's node's matrixWorld x child's transform
        let overrideMatrixWorld = node.matrixWorld;
        if (child.transform) {
            overrideMatrixWorld = tmpMatrix.multiplyMatrices(node.matrixWorld, child.transform);
        }

        const isVisible = cullingTest ? !cullingTest(context.camera, child, overrideMatrixWorld) : true;

        // child is not visible => skip
        if (!isVisible) {
            continue;
        }

        child.promise = requestNewTile(context.view, context.scheduler, layer, child, node, true).then(tile => {
            if (!tile || !node.parent) {
                // cancelled promise or node has been deleted
            } else {
                node.add(tile);
                tile.updateMatrixWorld();

                const extent = boundingVolumeToExtent(layer.extent.crs(), tile.boundingVolume, tile.matrixWorld);
                tile.traverse(obj => {
                    obj.extent = extent;
                });

                context.view.notifyChange(child);
            }
            delete child.promise;
        }, () => {
            delete child.promise;
        });
    }
}

function _subdivideNodeSubstractive(context, layer, node) {
    // Subdivision in progress => nothing to do
    if (node.pendingSubdivision) {
        return;
    }

    if (getChildTiles(node).length > 0) {
        return;
    }
    // No child => nothing to do either
    const childrenTiles = layer.tileIndex.index[node.tileId].children;
    if (childrenTiles === undefined || childrenTiles.length === 0) {
        return;
    }

    node.pendingSubdivision = true;

    // Substractive (refine = 'REPLACE') is an all or nothing subdivision mode
    const promises = [];
    for (const child of layer.tileIndex.index[node.tileId].children) {
        promises.push(
            requestNewTile(context.view, context.scheduler, layer, child, node, false).then(tile => {
                node.add(tile);
                tile.updateMatrixWorld();

                const extent = boundingVolumeToExtent(layer.extent.crs(), tile.boundingVolume, tile.matrixWorld);
                tile.traverse(obj => {
                    obj.extent = extent;
                });
            }));
    }
    Promise.all(promises).then(() => {
        node.pendingSubdivision = false;
        context.view.notifyChange(node);
    }, () => {
        node.pendingSubdivision = false;

        // delete other children
        for (const n of getChildTiles(node)) {
            n.visible = false;
            markForDeletion(layer, n);
        }
    });
}

export function $3dTilesCulling(camera, node, tileMatrixWorld) {
    // For viewer Request Volume https://github.com/AnalyticalGraphicsInc/3d-tiles-samples/tree/master/tilesets/TilesetWithRequestVolume
    if (node.viewerRequestVolume) {
        const nodeViewer = node.viewerRequestVolume;
        if (nodeViewer.region) {
            // TODO
            return true;
        }
        if (nodeViewer.box) {
            // TODO
            return true;
        }
        if (nodeViewer.sphere) {
            // To check the distance between the center sphere and the camera
            tmp.s.copy(nodeViewer.sphere);
            tmp.s.applyMatrix4(node.matrixWorld);
            if (!(camera.camera3D.position.distanceTo(tmp.s.center) <= tmp.s.radius)) {
                return true;
            }
        }
    }

    // For bounding volume
    if (node.boundingVolume) {
        const boundingVolume = node.boundingVolume;
        if (boundingVolume.region) {
            return !camera.isBox3Visible(boundingVolume.region.box3D,
                tileMatrixWorld.clone().multiply(boundingVolume.region.matrix));
        }
        if (boundingVolume.box) {
            return !camera.isBox3Visible(boundingVolume.box, tileMatrixWorld);
        }
        if (boundingVolume.sphere) {
            return !camera.isSphereVisible(boundingVolume.sphere, tileMatrixWorld);
        }
    }
    return false;
}

// Cleanup all 3dtiles|three.js starting from a given node n.
// n's children can be of 2 types:
//   - have a 'content' attribute -> it's a tileset and must
//     be cleaned with cleanup3dTileset()
//   - doesn't have 'content' -> it's a raw Object3D object,
//     and must be cleaned with _cleanupObject3D()
function cleanup3dTileset(layer, n, depth = 0) {
    unmarkForDeletion(layer, n);

    if (layer.tileIndex.index[n.tileId].obj) {
        layer.tileIndex.index[n.tileId].obj.deleted = Date.now();
        layer.tileIndex.index[n.tileId].obj = undefined;
    }

    // clean children tiles recursively
    for (const child of getChildTiles(n)) {
        cleanup3dTileset(layer, child, depth + 1);
        n.remove(child);
    }

    if (n.content) {
        // clean content
        n.content.traverse(_cleanupObject3D);
        n.remove(n.content);
        delete n.content;
    }

    if (n.dispose) {
        n.dispose();
    }


    // and finally remove from parent
    // if (depth == 0 && n.parent) {
    //     n.parent.remove(n);
    // }
}

// This function is used to cleanup a Object3D hierarchy.
// (no 3dtiles spectific code here because this is managed by cleanup3dTileset)
function _cleanupObject3D(n) {
    if (__DEBUG__) {
        if (n.tileId) {
            throw new Error(`_cleanupObject3D must not be called on a 3dtiles tile (tileId = ${n.tileId})`);
        }
    }
    // all children of 'n' are raw Object3D
    for (const child of n.children) {
        _cleanupObject3D(child);
    }
    // free resources
    if (n.material) {
        n.material.dispose();
    }
    if (n.geometry) {
        n.geometry.dispose();
    }
    n.remove(...n.children);
}

export function pre3dTilesUpdate(context, layer) {
    if (!layer.visible) {
        return [];
    }

    // Elements removed are added in the layer._cleanableTiles list.
    // Since we simply push in this array, the first item is always
    // the oldest one.
    const now = Date.now();
    if (layer._cleanableTiles.length
        && (now - layer._cleanableTiles[0].cleanableSince) > layer.cleanupDelay) {
        while (layer._cleanableTiles.length) {
            const elt = layer._cleanableTiles[0];
            if ((now - elt.cleanableSince) > layer.cleanupDelay) {
                cleanup3dTileset(layer, elt);
            } else {
                // later entries are younger
                break;
            }
        }
    }

    return [layer.root];
}

export function computeNodeSSE(context, node) {
    if (node.boundingVolume.region) {
        throw new Error('boundingVolume.region is unsupported');
    } else if (node.boundingVolume.box) {
        const sse = ScreenSpaceError.computeFromBox3(
            context.camera,
            node.boundingVolume.box,
            node.matrixWorld,
            node.geometricError,
            ScreenSpaceError.MODE_3D);

        if (!sse) {
            return Infinity;
        }
        return Math.max(sse.lengths.x, sse.lengths.y);
    } else if (!node.boundingVolume.sphere) {
        return Infinity;
    }
    if (node.distance === 0) {
        // This test is needed in case geometricError = distance = 0
        return Infinity;
    }
    return context.camera._preSSE * (node.geometricError / node.distance);
}

export function init3dTilesLayer(view, scheduler, layer) {
    return requestNewTile(view, scheduler, layer, layer.tileset.root, undefined, true).then(
        tile => {
            delete layer.tileset;
            layer.object3d.add(tile);
            tile.updateMatrixWorld();
            layer.tileIndex.index[tile.tileId].obj = tile;
            layer.root = tile;
            layer.extent = boundingVolumeToExtent(layer.projection || view.referenceCrs,
                tile.boundingVolume, tile.matrixWorld);
        });
}

function setDisplayed(node, display) {
    // The geometry of the tile is not in node, but in node.content
    // To change the display state, we change node.content.visible instead of
    // node.material.visible
    if (node.content) {
        node.content.visible = display;
    }
}

function markForDeletion(layer, elt) {
    if (!elt.cleanableSince) {
        elt.cleanableSince = Date.now();
        layer._cleanableTiles.push(elt);
    }
}

function unmarkForDeletion(layer, elt) {
    if (elt.cleanableSince) {
        layer._cleanableTiles.splice(layer._cleanableTiles.indexOf(elt), 1);
        elt.cleanableSince = undefined;
    }
}

function isTilesetContentReady(tileset, node) {
    return tileset && node && // is tileset loaded ?
        node.children.length == 1 && // is tileset root loaded ?
        node.children[0].children.length > 0;
}

function calculateCameraDistance(camera, node) {
    node.distance.min = 0;
    node.distance.max = 0;
    if (node.boundingVolume.region) {
        throw new Error('boundingVolume.region is unsupported');
    } else if (node.boundingVolume.box) {
        // boundingVolume.box is affected by matrixWorld
        tmp.b.copy(node.boundingVolume.box);
        tmp.b.applyMatrix4(node.matrixWorld);
        node.distance.min = tmp.b.distanceToPoint(camera.position);
        node.distance.max = node.distance.min + tmp.b.getSize(tmp.v).length();
    } else if (node.boundingVolume.sphere) {
        // boundingVolume.sphere is affected by matrixWorld
        tmp.s.copy(node.boundingVolume.sphere);
        tmp.s.applyMatrix4(node.matrixWorld);
        // TODO: this probably assumes that the camera has no parent
        node.distance.min = Math.max(0.0,
            tmp.s.distanceToPoint(camera.position));
        node.distance.max = node.distance.min + 2 * tmp.s.radius;
    }
}

export function process3dTilesNode(cullingTest = $3dTilesCulling, subdivisionTest = $3dTilesSubdivisionControl) {
    return function _process3dTilesNodes(context, layer, node) {
        // Remove deleted children (?)
        node.remove(...node.children.filter(c => c.deleted));

        // early exit if parent's subdivision is in progress
        if (node.parent.pendingSubdivision && !node.parent.additiveRefinement) {
            node.visible = false;
            return undefined;
        }
        let returnValue;

        // do proper culling
        const isVisible = cullingTest ? (!cullingTest(context.camera, node, node.matrixWorld)) : true;
        node.visible = isVisible;


        if (isVisible) {
            unmarkForDeletion(layer, node);

            // We need distance for 2 things:
            // - subdivision testing
            // - near / far calculation in MainLoop. For this one, we need the distance for *all* displayed tiles.
            // For this last reason, we need to calculate this here, and not in subdivisionControl
            calculateCameraDistance(context.camera.camera3D, node);
            if (node.pendingSubdivision || subdivisionTest(context, layer, node)) {
                subdivideNode(context, layer, node, cullingTest);
                // display iff children aren't ready
                if (node.additiveRefinement || node.pendingSubdivision) {
                    setDisplayed(node, true);
                } else {
                    // If one of our child is a tileset, this node must be displayed until this
                    // child content is ready, to avoid hiding our content too early (= when our child
                    // is loaded but its content is not)
                    const subtilesets = layer.tileIndex.index[node.tileId].children.filter(
                        tile => tile.isTileset);

                    if (subtilesets.length) {
                        let allReady = true;
                        for (const tileset of subtilesets) {
                            if (!isTilesetContentReady(tileset, node.children.filter(n => n.tileId == tileset.tileId)[0])) {
                                allReady = false;
                                break;
                            }
                        }
                        setDisplayed(node, allReady);
                    } else {
                        setDisplayed(node, true);
                    }
                }
                returnValue = getChildTiles(node);
            } else {
                setDisplayed(node, true);

                for (const n of getChildTiles(node)) {
                    n.visible = false;
                    markForDeletion(layer, n);
                }
            }
            // update material
            if (node.content && node.content.visible) {
                // it will therefore contribute to near / far calculation
                if (node.boundingVolume.region) {
                    throw new Error('boundingVolume.region is not yet supported');
                } else if (node.boundingVolume.box) {
                    layer._distance.min = Math.min(layer._distance.min, node.distance.min);
                    layer._distance.max = Math.max(layer._distance.max, node.distance.max);
                } else if (node.boundingVolume.sphere) {
                    layer._distance.min = Math.min(layer._distance.min, node.distance.min);
                    layer._distance.max = Math.max(layer._distance.max, node.distance.max);
                }
                node.content.traverse(o => {
                    if (o.layer == layer && o.material) {
                        o.material.wireframe = layer.wireframe;
                        if (o.isPoints) {
                            if (o.material.update) {
                                o.material.update(layer.material);
                            } else {
                                o.material.copy(layer.material);
                            }
                        }
                    }
                });
            }
        } else if (node != layer.root) {
            if (node.parent && node.parent.additiveRefinement) {
                markForDeletion(layer, node);
            }
        }

        return returnValue;
    };
}

export function $3dTilesSubdivisionControl(context, layer, node) {
    if (layer.tileIndex.index[node.tileId].children === undefined) {
        return false;
    }
    if (layer.tileIndex.index[node.tileId].isTileset) {
        return true;
    }

    const sse = computeNodeSSE(context, node);
    node.sse = sse;

    return sse > layer.sseThreshold;
}
