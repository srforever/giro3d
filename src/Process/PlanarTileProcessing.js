function frustumCullingOBB(node, camera) {
    return camera.isBox3Visible(node.OBB().box3D, node.OBB().matrixWorld);
}

export function planarCulling(node, camera) {
    return !frustumCullingOBB(node, camera);
}

export function prePlanarUpdate(context, layer) {
    const elevationLayers = context.view.getLayers((l, a) => a && a.id == layer.id && l.type == 'elevation');
    context.maxElevationLevel = -1;
    for (const e of elevationLayers) {
        context.maxElevationLevel = Math.max(e.options.zoom.max, context.maxElevationLevel);
    }
    if (context.maxElevationLevel == -1) {
        context.maxElevationLevel = Infinity;
    }
}

export function planarSubdivisionControl(maxLevel) {
    return function _planarSubdivisionControl(context, layer, node) {
        if (maxLevel <= node.level) {
            return false;
        }

        if (node._a.sse[0] == Infinity) {
            return true;
        }

        const a = node._a.sse[1].clone().sub(node._a.sse[0]).length();
        const b = node._a.sse[2].clone().sub(node._a.sse[0]).length();

        if (a < 200 || b < 200) {
            return false;
        }
        return a > 256 || b > 256;
    };
}
