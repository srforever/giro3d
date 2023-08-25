import Extent from '../core/geographic/Extent';

function fromOLExtent(extent, projectionCode) {
    return new Extent(projectionCode, extent[0], extent[2], extent[1], extent[3]);
}

function toOLExtent(extent, margin = 0) {
    return [
        extent.west() - margin,
        extent.south() - margin,
        extent.east() + margin,
        extent.north() + margin,
    ];
}

export default {
    fromOLExtent,
    toOLExtent,
};
