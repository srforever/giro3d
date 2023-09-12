import proj from 'proj4';

/**
 * Transform the position buffer in place, from the source to the destination CRS.
 * The buffer is expected to contain N * stride elements, where N is the number of points.
 * Only the 2 first elements of each point (i.e the X and Y coordinate) are transformed. The other
 * elements are left untouched.
 *
 * @param buf The buffer to transform.
 * @param params The transformation parameters.
 * @param params.srcCrs The source CRS code. Must be known to PROJ.
 * @param params.dstCrs The destination CRS code. Must be known to PROJ.
 * @param params.offsetX The offset to the original X coordinate before transformation.
 * @param params.offsetY The offset to the original Y coordinate before transformation.
 * @param params.stride The stride of the buffer.
 */
function transformBufferInPlace(buf: number[],
    params: {
        srcCrs: string;
        dstCrs: string;
        stride: number;
        offsetX?: number;
        offsetY?: number;
    }) {
    if (params.srcCrs === params.dstCrs) {
        return;
    }
    if (params.stride === undefined || params.stride < 2) {
        throw new Error('invalid stride: must be at least 2');
    }

    const src = proj.Proj(params.srcCrs);
    const dst = proj.Proj(params.dstCrs);

    const tmp = { x: 0, y: 0 };
    const length = buf.length;

    const offsetX = params.offsetX ?? 0;
    const offsetY = params.offsetY ?? 0;
    const stride = params.stride;

    for (let i = 0; i < length; i += stride) {
        tmp.x = buf[i + 0] + offsetX;
        tmp.y = buf[i + 1] + offsetY;
        const out = proj.transform(src, dst, tmp);
        buf[i + 0] = out.x;
        buf[i + 1] = out.y;
    }
}

export default {
    transformBufferInPlace,
};
