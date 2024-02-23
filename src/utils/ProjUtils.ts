import proj from 'proj4';
import { Vector2, type TypedArray } from 'three';

const ZERO = new Vector2(0, 0);

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
 * @param params.stride The stride of the buffer.
 * @param params.offset The offset to apply after transforming the coordinate.
 */
function transformBufferInPlace(buf: TypedArray,
    params: {
        srcCrs: string;
        dstCrs: string;
        stride: number;
        offset?: Vector2;
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

    const stride = params.stride;
    const offset = params.offset ?? ZERO;

    for (let i = 0; i < length; i += stride) {
        tmp.x = buf[i + 0];
        tmp.y = buf[i + 1];
        const out = proj.transform(src, dst, tmp);
        buf[i + 0] = out.x + offset.x;
        buf[i + 1] = out.y + offset.y;
    }
}

export default {
    transformBufferInPlace,
};
