import type { Extent as OLExtent } from 'ol/extent';
import Extent from '../core/geographic/Extent';

function fromOLExtent(extent: OLExtent, projectionCode: string) {
    return new Extent(projectionCode, extent[0], extent[2], extent[1], extent[3]);
}

function toOLExtent(extent: Extent, margin = 0): OLExtent {
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
