/**
 * @module Core/TileGeometry
 */

import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

import OBB from '../Renderer/ThreeExtended/OBB.js';

const tmp = {
    dimensions: { x: 0, y: 0 },
};

/**
 * The TileGeometry provides a new buffer geometry for each
 * {@link module:Core/TileMesh~TileMesh TileMesh} of a
 * {@link module:entities/Map~Map Map} object.
 *
 * It is implemented for performance using a rolling approach.
 * The rolling approach is a special case of the sliding window algorithm with
 * a single value window where we iterate (roll, slide) over the data array to
 * compute everything in a single pass (complexity O(n)).
 * By default it produces square geometries but providing different width and height
 * allows for rectangular tiles creation.
 *
 * @example
 * // Inspired from Map.requestNewTile
 * const extent = new Extent('EPSG:3857', -1000, -1000, 1000, 1000);
 * const paramsGeometry = { extent, segment: 8 };
 * const geometry = new TileGeometry(paramsGeometry);
 * @param {object} params : Parameters to construct the grid. Should contain an extent
 *  and a size, either a number of segment or a width and an height in pixels.
 * @api
 */
class TileGeometry extends BufferGeometry {
    constructor(params) {
        super();
        // Still mandatory to have on the geometry ?
        this.extent = params.extent;
        this.center = new Vector3(...this.extent.center()._values);
        // Compute properties of the grid, square or rectangular.
        const width = params.width || params.segment + 1;
        const height = params.height || params.segment + 1;
        const dimension = this.extent.dimensions(tmp.dimensions);
        const segmentX = width - 1;
        const segmentY = height - 1;
        const uvStepX = 1 / segmentX;
        const uvStepY = 1 / segmentY;
        const rowStep = uvStepX * dimension.x;
        const columnStep = uvStepY * -dimension.y;
        this.props = {
            width,
            height,
            uvStepX,
            uvStepY,
            rowStep,
            columnStep,
            translateX: -segmentX * 0.5 * rowStep,
            translateY: -segmentY * 0.5 * columnStep,
            triangles: segmentX * segmentY * 2,
            numVertices: width * height,
        };
        this.computeBuffers(this.props);
        // Compute the Oriented Bounding Box for spatial operations
        this.computeBoundingBox();
        this.OBB = new OBB(this.boundingBox.min, this.boundingBox.max);
    }

    /**
     * Construct a simple grid buffer geometry using a fast rolling approach.
     *
     * @param {object} props : Properties of the TileGeometry grid, as prepared by this.prepare.
     * @api
     */
    computeBuffers(props) {
        const width = props.width;
        const height = props.height;
        const rowStep = props.rowStep;
        const columnStep = props.columnStep;
        const translateX = props.translateX;
        const translateY = props.translateY;
        const uvStepX = props.uvStepX;
        const uvStepY = props.uvStepY;
        const numVertices = props.numVertices;

        const uvs = new Float32Array(numVertices * 2);
        const positions = new Float32Array(numVertices * 3);
        const indices = new Uint32Array(props.triangles * 3);

        let posX;
        let h = 0;
        let iPos = 0;
        let uvY = 0.0;
        let indicesNdx = 0;
        let posY = translateY;
        let posNdx;
        let uvNdx;

        // Top border
        //
        for (posX = 0; posX < width; posX++) {
            // Store xy position and and corresponding uv of a pixel data.
            posNdx = iPos * 3;
            positions[posNdx + 0] = posX * rowStep + translateX;
            positions[posNdx + 1] = -posY;
            positions[posNdx + 2] = 0.0;
            uvNdx = iPos * 2;
            uvs[uvNdx + 0] = posX * uvStepX;
            uvs[uvNdx + 1] = uvY;
            iPos += 1;
        }
        // Next rows
        //
        for (h = 1; h < height; h++) {
            posY = h * columnStep + translateY;
            uvY = h * uvStepY;
            // First cell, left border
            posX = 0;
            // Store xy position and and corresponding uv of a pixel data.
            posNdx = iPos * 3;
            positions[posNdx + 0] = posX * rowStep + translateX;
            positions[posNdx + 1] = -posY;
            positions[posNdx + 2] = 0.0;
            uvNdx = iPos * 2;
            uvs[uvNdx + 0] = posX * uvStepX;
            uvs[uvNdx + 1] = uvY;
            iPos += 1;
            // Next cells
            for (posX = 1; posX < width; posX++) {
                // Construct indices as two different triangles from a
                // particular vertex. Use previous and aboves while rolling
                // so discard first row (top border) and first data of each
                // row (left border).
                // x---x       x   .
                //  \  |       | \
                //   \ |       |  \
                // .   x       x---x
                const above = iPos - width;
                const previousPos = iPos - 1;
                const previousAbove = above - 1;
                indices[indicesNdx + 0] = iPos;
                indices[indicesNdx + 1] = previousAbove;
                indices[indicesNdx + 2] = above;
                indices[indicesNdx + 3] = iPos;
                indices[indicesNdx + 4] = previousPos;
                indices[indicesNdx + 5] = previousAbove;
                indicesNdx += 6;
                // Store xy position and and corresponding uv of a pixel data.
                posNdx = iPos * 3;
                positions[posNdx + 0] = posX * rowStep + translateX;
                positions[posNdx + 1] = -posY;
                positions[posNdx + 2] = 0.0;
                uvNdx = iPos * 2;
                uvs[uvNdx + 0] = posX * uvStepX;
                uvs[uvNdx + 1] = uvY;
                iPos += 1;
            }
        }
        this.setAttribute('uv', new BufferAttribute(uvs, 2));
        this.setAttribute('position', new BufferAttribute(positions, 3));
        this.setIndex(new BufferAttribute(indices, 1));
    }
}

export default TileGeometry;
