import * as THREE from 'three';
import Extent from '../Core/Geographic/Extent';
import CancelledCommandException from '../Core/Scheduler/CancelledCommandException';

function requestNewTile(view, scheduler, layer, metadata, parent, redraw) {
    if (metadata.obj) {
        unmarkForDeletion(layer, metadata.obj);
        return Promise.resolve(metadata.obj);
    }

    const command = {
        /* mandatory */
        view,
        requester: parent,
        layer,
        priority: parent ? parent.sse : 1,
        /* specific params */
        metadata,
        redraw,
        earlyDropFunction: cmd =>
            cmd.requester && cmd.requester.additiveRefinement && (
                // requester cleaned
                !cmd.requester.parent ||
                // requester not visible anymore
                !cmd.requester.visible ||
                // requester visible but doesn't need subdivision anymore
                cmd.requester.sse < cmd.layer.sseThreshold),
    };

    return scheduler.execute(command).then(
        (node) => {
            metadata.obj = node;
            return node;
        },
        (err) => {
            if (err instanceof CancelledCommandException) {
                return undefined;
            }
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

const tmpBox3 = new THREE.Box3();
const tmpSphere = new THREE.Sphere();
function boundingVolumeToExtent(crs, volume, transform) {
    if (volume.region) {
        return new Extent('EPSG:4326',
            THREE.Math.radToDeg(volume.region[0]),
            THREE.Math.radToDeg(volume.region[2]),
            THREE.Math.radToDeg(volume.region[1]),
            THREE.Math.radToDeg(volume.region[3]));
    } else if (volume.box) {
        const box = tmpBox3.copy(volume.box).applyMatrix4(transform);
        return Extent.fromBox3(crs, box);
    } else {
        const sphere = tmpSphere.copy(volume.sphere).applyMatrix4(transform);
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
        // child being downloaded => skip
        if (child.promise) {
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

        child.promise = requestNewTile(context.view, context.scheduler, layer, child, node, true).then((tile) => {
            if (!tile || !node.parent) {
                // cancelled promise or node has been deleted
            } else {
                node.add(tile);
                tile.updateMatrixWorld();

                const extent = boundingVolumeToExtent(layer.extent.crs(), tile.boundingVolume, tile.matrixWorld);
                tile.traverse((obj) => {
                    obj.extent = extent;
                });

                context.view.notifyChange(child);
            }
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
            requestNewTile(context.view, context.scheduler, layer, child, node, false).then((tile) => {
                node.add(tile);
                tile.updateMatrixWorld();

                const extent = boundingVolumeToExtent(layer.extent.crs(), tile.boundingVolume, tile.matrixWorld);
                tile.traverse((obj) => {
                    obj.extent = extent;
                });

                // If children is a tileset, we need to prefetch here, because 'node' will
                // be hidden as soon as its children are created. But if a child is a tileset,
                // the real content is in its own child.
                // So we block node.pendingSubdivision until child's child is ready

                const childPromises = [];
                if (layer.tileIndex.index[tile.tileId].isTileset) {
                    for (const childchild of layer.tileIndex.index[tile.tileId].children) {
                        childPromises.push(requestNewTile(context.view, context.scheduler, layer, childchild, tile, false));
                    }
                    return Promise.all(childPromises);
                }
            }));
    }
    Promise.all(promises).then(() => {
        node.pendingSubdivision = false;
        context.view.notifyChange(node);
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
            const worldCoordinateCenter = nodeViewer.sphere.center.clone();
            worldCoordinateCenter.applyMatrix4(tileMatrixWorld);
            // To check the distance between the center sphere and the camera
            if (!(camera.camera3D.position.distanceTo(worldCoordinateCenter) <= nodeViewer.sphere.radius)) {
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

const boundingVolumeBox = new THREE.Box3();
const boundingVolumeSphere = new THREE.Sphere();
export function computeNodeSSE(camera, node) {
    node.distance = 0;
    if (node.boundingVolume.region) {
        boundingVolumeBox.copy(node.boundingVolume.region.box3D);
        boundingVolumeBox.applyMatrix4(node.boundingVolume.region.matrixWorld);
        node.distance = boundingVolumeBox.distanceToPoint(camera.camera3D.position);
    } else if (node.boundingVolume.box) {
        // boundingVolume.box is affected by matrixWorld
        boundingVolumeBox.copy(node.boundingVolume.box);
        boundingVolumeBox.applyMatrix4(node.matrixWorld);
        node.distance = boundingVolumeBox.distanceToPoint(camera.camera3D.position);
    } else if (node.boundingVolume.sphere) {
        // boundingVolume.sphere is affected by matrixWorld
        boundingVolumeSphere.copy(node.boundingVolume.sphere);
        boundingVolumeSphere.applyMatrix4(node.matrixWorld);
        // TODO: see https://github.com/iTowns/itowns/issues/800
        node.distance = Math.max(0.0,
            boundingVolumeSphere.distanceToPoint(camera.camera3D.position));
    } else {
        return Infinity;
    }
    if (node.distance === 0) {
        // This test is needed in case geometricError = distance = 0
        return Infinity;
    }
    return camera._preSSE * (node.geometricError / node.distance);
}

export function init3dTilesLayer(view, scheduler, layer) {
    return requestNewTile(view, scheduler, layer, layer.tileset.root, undefined, true).then(
            (tile) => {
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

            if (node.pendingSubdivision || subdivisionTest(context, layer, node)) {
                subdivideNode(context, layer, node, cullingTest);
                // display iff children aren't ready
                setDisplayed(node, node.pendingSubdivision || node.additiveRefinement);
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
                node.content.traverse((o) => {
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

    const sse = computeNodeSSE(context.camera, node);
    node.sse = sse;
    return sse > layer.sseThreshold;
}
