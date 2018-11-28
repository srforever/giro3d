import CancelledCommandException from '../Core/Scheduler/CancelledCommandException';
import ObjectRemovalHelper from './ObjectRemovalHelper';
import ScreenSpaceError from '../Core/ScreenSpaceError';
import SubdivisionControl from './SubdivisionControl';

function requestNewTile(view, scheduler, geometryLayer, extent, parent, level) {
    const command = {
        /* mandatory */
        view,
        requester: parent,
        layer: geometryLayer,
        priority: 10000,
        /* specific params */
        extent,
        level,
        redraw: false,
        threejsLayer: geometryLayer.threejsLayer,
    };

    const node = scheduler.execute(command);

    node.material.uniforms.tileDimensions.value.copy(node.extent.dimensions());
    node.add(node.OBB());
    geometryLayer.onTileCreated(geometryLayer, parent, node);

    return node;
}

function subdivideNode(context, layer, node) {
    if (!node.children.some(n => n.layer == layer)) {
        const extents = node.extent.quadtreeSplit();

        const promises = [];
        const children = [];
        for (const extent of extents) {
            const child = requestNewTile(
                context.view, context.scheduler, layer, extent, node);
            node.add(child);

            // inherit our parent's textures
            for (const e of context.elevationLayers) {
                e.update(context, e, child, node, true);
            }
            for (const c of context.colorLayers) {
                c.update(context, c, child, node, true);
            }

            child.updateMatrixWorld(true);
        }
        context.view.notifyChange(node, false);
    }
}

function updateMinMaxDistance(context, node) {
    const bbox = node.OBB().box3D.clone()
        .applyMatrix4(node.OBB().matrixWorld);
    const distance = context.distance.plane
        .distanceToPoint(bbox.getCenter());
    const radius = bbox.getSize().length() * 0.5;
    context.distance.update(distance - radius, distance + radius);
}

// TODO: maxLevel should be deduced from layers
function testTileSSE(tile, sse, maxLevel) {
    if (maxLevel > 0 && maxLevel <= tile.level) {
        return false;
    }

    if (tile.extent.dimensions().x < 5) {
        return false;
    }

    if (!sse) {
        return true;
    }

    const values = [
        sse.lengths.x * sse.ratio,
        sse.lengths.y * sse.ratio
    ];

    // TODO: depends on texture size of course
    // if (values.filter(v => v < 200).length >= 2) {
    //     return false;
    // }
    if (values.filter(v => v < 100).length >= 1) {
        return false;
    }
    return values.filter(v => v >= 256).length >= 2;
}

function preUpdate(context, layer, changeSources) {
    SubdivisionControl.preUpdate(context, layer);

    if (__DEBUG__) {
        layer._latestUpdateStartingLevel = 0;
    }

    if (changeSources.has(undefined) || changeSources.size == 0) {
        return layer.level0Nodes;
    }

    let commonAncestor;
    for (const source of changeSources.values()) {
        if (source.isCamera) {
            // if the change is caused by a camera move, no need to bother
            // to find common ancestor: we need to update the whole tree:
            // some invisible tiles may now be visible
            return layer.level0Nodes;
        }
        if (source.layer === layer.id) {
            if (!commonAncestor) {
                commonAncestor = source;
            } else {
                commonAncestor = source.findCommonAncestor(commonAncestor);
                if (!commonAncestor) {
                    return layer.level0Nodes;
                }
            }
            if (commonAncestor.material == null) {
                commonAncestor = undefined;
            }
        }
    }
    if (commonAncestor) {
        if (__DEBUG__) {
            layer._latestUpdateStartingLevel = commonAncestor.level;
        }
        return [commonAncestor];
    } else {
        return layer.level0Nodes;
    }
}

function update(context, layer, node) {
    if (!node.parent) {
        return ObjectRemovalHelper.removeChildrenAndCleanup(layer, node);
    }

    // early exit if parent' subdivision is in progress
    if (node.parent.pendingSubdivision) {
        node.visible = false;
        node.setDisplayed(false);
        return undefined;
    }

    if (context.fastUpdateHint) {
        if (!context.fastUpdateHint.isAncestorOf(node)) {
            // if visible, children bbox can only be smaller => stop updates
            if (node.material.visible) {
                updateMinMaxDistance(context, node);
                return;
            } else if (node.visible) {
                return node.children.filter(n => n.layer == layer);
            } else {
                return;
            }
        }
    }

    // do proper culling
    if (!layer.frozen) {
        const isVisible = context.camera.isBox3Visible(node.OBB().box3D, node.OBB().matrixWorld);
        node.visible = isVisible;
    }

    if (node.visible) {
        let requestChildrenUpdate = false;

        if (!layer.frozen) {
            const s = node.OBB().box3D.getSize();
            const obb = node.OBB();
            const sse = ScreenSpaceError.computeFromBox3(
                    context.camera,
                    obb.box3D,
                    obb.matrixWorld,
                    Math.max(s.x, s.y),
                    ScreenSpaceError.MODE_2D);

            if (true || __DEBUG__) {
                node.sse = sse; // DEBUG
            }

            if (node.pendingSubdivision ||
                (testTileSSE(node, sse, layer.maxSubdivisionLevel || -1) &&
                    SubdivisionControl.hasEnoughTexturesToSubdivide(context, layer, node))) {
                subdivideNode(context, layer, node);
                // display iff children aren't ready
                node.setDisplayed(node.pendingSubdivision);
                requestChildrenUpdate = true;
            } else {
                node.setDisplayed(true);
            }
        } else {
            requestChildrenUpdate = true;
        }

        if (node.material.visible) {
            updateMinMaxDistance(context, node);

            // update uniforms
            if (context.view.fogDistance != undefined) {
                node.setFog(context.view.fogDistance);
            }

            if (!requestChildrenUpdate) {
                return ObjectRemovalHelper.removeChildren(layer, node);
            }
        }

        // TODO: use Array.slice()
        return requestChildrenUpdate ? node.children.filter(n => n.layer == layer) : undefined;
    }

    node.setDisplayed(false);
    return ObjectRemovalHelper.removeChildren(layer, node);
}

export default {
    preUpdate,
    update,
    requestNewTile,
};
