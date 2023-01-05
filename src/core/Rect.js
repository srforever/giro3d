/** @module core/Rect */

/**
 * A rectangle.
 */
class Rect {
    constructor(xMin, xMax, yMin, yMax) {
        this.xMin = xMin;
        this.xMax = xMax;
        this.yMin = yMin;
        this.yMax = yMax;
    }

    get left() {
        return this.xMin;
    }

    get right() {
        return this.xMax;
    }

    get top() {
        return this.yMax;
    }

    get bottom() {
        return this.yMin;
    }

    get width() {
        return this.xMax - this.xMin;
    }

    get height() {
        return this.yMax - this.yMin;
    }

    get centerX() {
        return this.xMin + ((this.xMax - this.xMin) * 0.5);
    }

    get centerY() {
        return this.yMin + ((this.yMax - this.yMin) * 0.5);
    }

    static fromExtent(extent) {
        return new Rect(extent.west(), extent.east(), extent.south(), extent.north());
    }

    /**
     * Returns the equivalent rectangle of `source` normalized over the dimensions of `dest`.
     *
     * @param {Rect} source The source rect.
     * @param {Rect} dest The destination rect.
     */
    static getNormalizedRect(source, dest) {
        const dstDim = { x: dest.width, y: dest.height };
        const srcDim = { x: source.width, y: source.height };
        let x = (source.left - dest.left) / dstDim.x;
        // We reverse north and south because canvas coordinates are top left corner based,
        // whereas extents are bottom left based.
        let y = (dest.top - source.top) / dstDim.y;

        let w = srcDim.x / dstDim.x;
        let h = srcDim.y / dstDim.y;

        // Necessary to avoid seams between tiles due to problems in
        // floating point precision when tile size is a multiple of the canvas size.
        const precision = 10 ** 10;

        x = (Math.round((x + Number.EPSILON) * precision) / precision);
        y = (Math.round((y + Number.EPSILON) * precision) / precision);
        w = (Math.round((w + Number.EPSILON) * precision) / precision);
        h = (Math.round((h + Number.EPSILON) * precision) / precision);

        return {
            x, y, w, h,
        };
    }
}

export default Rect;
