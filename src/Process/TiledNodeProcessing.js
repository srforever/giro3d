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
    node.add(node.OBB());
    geometryLayer.onTileCreated(geometryLayer, parent, node);

    return node;
}

export default {
    requestNewTile,
};
