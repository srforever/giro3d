export default {
    preUpdate: (context, layer) => {
        context.colorLayers = context.view.getLayers(
            (l, a) => a && a.id === layer.id && l.type === 'color');
        context.elevationLayers = context.view.getLayers(
            (l, a) => a && a.id === layer.id && l.type === 'elevation');
    },

    hasEnoughTexturesToSubdivide: (context, layer, node) => {
        // Prevent subdivision if node is covered by at least one elevation layer
        // and if node doesn't have a elevation texture yet.
        for (const e of context.elevationLayers) {
            if (!e.frozen && e.ready && e.tileInsideLimit(node, e) && !node.material.isLayerTextureLoaded({ type: 'elevation' })) {
                // no stop subdivision in the case of a loading error
                if (node.layerUpdateState[e.id] && node.layerUpdateState[e.id].inError()) {
                    continue;
                }
                return false;
            }
        }

        if (node.children.some(n => n.layer === layer)) {
            // No need to prevent subdivision, since we've already done it before
            return true;
        }

        // Prevent subdivision if missing color texture
        /* for (const c of context.colorLayers) {
            if (c.frozen || !c.visible || !c.ready) {
                continue;
            }
            // no stop subdivision in the case of a loading error
            if (node.layerUpdateState[c.id] && node.layerUpdateState[c.id].inError()) {
                continue;
            }
            if (c.tileInsideLimit(node, c) && !node.material.isLayerTextureLoaded(c)) {
                return false;
            }
            } */
        return true;
    },
};
