/**
 * @module Core/TileGeometry
 */

import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

import OBB from '../Renderer/ThreeExtended/OBB.js';

/**
 * The TileGeometry provides a new buffer geometry for each
 * {@link module:Core/TileMesh~TileMesh TileMesh} of a
 * {@link module:entities/Map~Map Map} object.
 *
 * It is implemented for performance using a rolling approach.
 * By default it produces square geometries but providing different width and height
 * allows for rectangular tiles creation.
 *
 * @example
 * // Inspired from Map@requestNewTile
 * const extent = new Extent('EPSG:3857', -1000, -1000, 1000, 1000);
 * const paramsGeometry = { extent, segment: 8 };
 * const geometry = new TileGeometry(paramsGeometry);
 * @param {object} params : Parameters to construct the grid. Should contain an extent
 *  and a size, either a number of segment or a width and an height in pixels.
 * @api
 */
class TileGeometry extends BufferGeometry {
    constructor(params, geometry = undefined) {
        super();
        // Compute properties of the grid, square or rectangular.
        this.props = this.prepare(params);
        // Compute buffers (no normals because the z displacement is in the shader)
        if (!geometry) {
            this.computeBuffers(this.props);
        } else {
            this.copy(geometry);
        }
        // Compute the Oriented Bounding Box for spatial operations
        this.computeBoundingBox();
        this.OBB = new OBB(this.boundingBox.min, this.boundingBox.max);
    }

    /**
     * Prepare the grid properties from parameters.
     *
     * @param {object} params : Parameters to construct the grid. Should contain an extent
     *  and a size, either a number of segment or a width and an height in pixels.
     * @api
     */
    prepare(params) {
        // Still mandatory to have on the geometry ?
        this.extent = params.extent;
        this.center = new Vector3(...this.extent.center()._values);
        const nodata = params.nodata;
        const width = params.width || params.segment + 1;
        const height = params.height || params.segment + 1;
        const numVertices = width * height;
        const segmentX = width - 1;
        const segmentY = height - 1;
        const uvStepX = 1 / segmentX;
        const uvStepY = 1 / segmentY;
        const triangles = segmentX * segmentY * 2;
        const dimension = this.extent.dimensions();
        const rowStep = uvStepX * dimension.x;
        const columnStep = uvStepY * -dimension.y;
        const translateX = -segmentX * 0.5 * rowStep;
        const translateY = -segmentY * 0.5 * columnStep;
        const direction = params.direction || 'top';
        return {
            width,
            height,
            uvStepX,
            uvStepY,
            rowStep,
            columnStep,
            translateX,
            translateY,
            nodata,
            direction,
            triangles,
            numVertices,
        };
    }

    /**
     * Construct a simple grid buffer geometry using a fast rolling approach.
     *
     * @param {object} props : Properties of the TileGeometry grid, as prepared by this.prepare.
     * @param {Array} data : Array of elevation data to update vertices z with.
     * @api
     */
    computeBuffers(props, data = undefined) {
        const width = props.width;
        const height = props.height;
        const rowStep = props.rowStep;
        const columnStep = props.columnStep;
        const translateX = props.translateX;
        const translateY = props.translateY;
        const uvStepX = props.uvStepX;
        const uvStepY = props.uvStepY;
        const direction = props.direction;
        const numVertices = props.numVertices;

        const uvs = new Float32Array(numVertices * 2);
        const positions = new Float32Array(numVertices * 3);
        const indices = new Uint32Array(props.triangles * 3);
        if (!data) {
            data = new Float32Array(numVertices);
        }

        let posX;
        let h = 0;
        let iPos = 0;
        let uvY = 0.0;
        let indicesNdx = 0;
        let posY = translateY;
        let iY = direction === 'top' ? iPos : numVertices - width;

        // Store xyz position and and corresponding uv of a pixel data.
        function handleCell() {
            const posNdx = iPos * 3;
            positions[posNdx + 0] = posX * rowStep + translateX;
            positions[posNdx + 1] = -posY;
            positions[posNdx + 2] = data[iY + posX];
            const uvNdx = iPos * 2;
            uvs[uvNdx + 0] = posX * uvStepX;
            uvs[uvNdx + 1] = uvY;
            iPos += 1;
        }

        // Construct indices as two different triangles from a particular vertex.
        // Use previous and aboves while rolling so discard first row (top border)
        // and first data of each row (left border).
        // x---x       x   .
        //  \  |       | \
        //   \ |       |  \
        // .   x       x---x
        function indicesSimple() {
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
        }

        // Top border
        //
        for (posX = 0; posX < width; posX++) {
            handleCell();
        }
        // Next rows
        //
        for (h = 1; h < height; h++) {
            posY = h * columnStep + translateY;
            iY = direction === 'top' ? iPos : numVertices - (h + 1) * width;
            uvY = h * uvStepY;
            // First cell
            posX = 0;
            handleCell();
            // Next cells
            for (posX = 1; posX < width; posX++) {
                indicesSimple();
                handleCell();
            }
        }

        this.setAttribute('uv', new BufferAttribute(uvs, 2));
        this.setAttribute('position', new BufferAttribute(positions, 3));
        this.setIndex(new BufferAttribute(indices, 1));
    }

    /**
     * Construct a triangulated buffer geometry based on nodata values.
     *
     * Nodata values are discarded and we compute indices triangles according
     * to the presence or absence of neighbors data points :
     *  x---x       x   .       x---x      .   x       p3   p4
     *   \  |       | \         |  /         / |
     *    \ |       |  \        | /         /  |
     *  .   x       x---x       x   .      x---x       p2   p1
     *
     * @param {object} props : Properties of the TileGeometry grid, as prepared by this.prepare.
     * @param {Array} data : Array of elevation data to update vertices z with.
     * @api
     */
    computeBuffersNoData(props, data) {
        // Depile props
        const width = props.width;
        const height = props.height;
        const rowStep = props.rowStep;
        const columnStep = props.columnStep;
        const translateX = props.translateX;
        const translateY = props.translateY;
        const uvStepX = props.uvStepX;
        const uvStepY = props.uvStepY;
        const direction = props.direction;
        const numVertices = props.numVertices;
        const nodata = props.nodata;

        const indicesTable = {};
        const uvs = new Float32Array(numVertices * 2);
        const positions = new Float32Array(numVertices * 3);
        const indices = new Uint32Array(props.triangles * 3);
        const fullSize = width * height;

        let p2;
        let value;
        let h = 0;
        let i = 0;
        let iPos = 0;
        let posX = 0;
        let uvY = 0.0;
        let indicesNdx = 0;
        let posY = translateY;
        let iY = direction === 'top' ? iPos : fullSize - width;

        function handleCell() {
            const posNdx = iPos * 3;
            positions[posNdx + 0] = posX * rowStep + translateX;
            positions[posNdx + 1] = -posY;
            positions[posNdx + 2] = value;
            const uvNdx = iPos * 2;
            uvs[uvNdx] = posX * uvStepX;
            uvs[uvNdx + 1] = uvY;
            indicesTable[i] = iPos;
            iPos += 1;
        }

        // Top border
        //
        for (posX = 0; posX < width; posX++) {
            value = data[iY + posX];
            if (value !== nodata) {
                handleCell();
            }
            i++;
        }
        // Next rows
        //
        for (h = 1; h < height; h++) {
            posY = h * columnStep + translateY;
            iY = direction === 'top' ? i : fullSize - (h + 1) * width;
            uvY = h * uvStepY;
            // First cell
            posX = 0;
            value = data[iY];
            p2 = false;
            if (value !== nodata) {
                handleCell();
                p2 = true;
            }
            i++;
            // Next cells
            for (posX = 1; posX < width; posX++) {
                value = data[iY + posX];

                const above = i - width;
                const previousPos = iPos - 1;
                const p3 = indicesTable[above - 1];
                const p4 = indicesTable[above];
                const hasP3 = p3 !== undefined;
                const hasP4 = p4 !== undefined;

                if (value !== nodata) { // p1
                    if (hasP3) {
                        if (hasP4) {
                            indices[indicesNdx + 0] = iPos; //           x---x
                            indices[indicesNdx + 1] = p3; //              \  |
                            indices[indicesNdx + 2] = p4; //               \ |
                            indicesNdx += 3; //                          .   x
                        }
                        if (p2) {
                            indices[indicesNdx + 0] = iPos; //           x   .
                            indices[indicesNdx + 1] = previousPos; //    | \
                            indices[indicesNdx + 2] = p3; //             |  \
                            indicesNdx += 3; //                          x---x
                        }
                    } else if (p2 && hasP4) {
                        indices[indicesNdx + 0] = iPos; //               .   x
                        indices[indicesNdx + 1] = previousPos; //          / |
                        indices[indicesNdx + 2] = p4; //                  /  |
                        indicesNdx += 3; //                              x---x
                    }
                    handleCell();
                    p2 = true;
                } else if (p2 && hasP3 && hasP4) {
                    indices[indicesNdx + 0] = previousPos; //            x---x
                    indices[indicesNdx + 1] = p3; //                     |  /
                    indices[indicesNdx + 2] = p4; //                     | /
                    indicesNdx += 3; //                                  x   .
                    p2 = false;
                } else {
                    p2 = false;
                }
                i++;
            }
        }

        this.setAttribute('uv', new BufferAttribute(uvs, 2));
        this.setAttribute('position', new BufferAttribute(positions, 3));
        this.setIndex(new BufferAttribute(indices.slice(0, indicesNdx), 1));
    }

    /**
     * Update the geometry with new properties, elevation data and possible nodata.
     *
     * - If there is no elevation data, compute a simple grid with the new properties.
     * - If there is no nodata value specified, or no value of the data is nodata,
     *   compute a simple grid with the elevation data.
     * - If all the values of the data are no data, empty the geometry buffers.
     *
     * @param {object} props : Properties of the TileGeometry grid, as prepared by this.prepare.
     * @param {Array} data : Array of elevation data to update vertices z with.
     * @api
     */
    updateGeometry(props, data = undefined) {
        if (data && props.nodata !== undefined) {
            props.numVertices = data.filter(x => x !== props.nodata).length;
            if (props.numVertices === props.width * props.height) {
                // No nodata values, simple grid with elevation
                this.computeBuffers(props, data);
                return;
            }
            if (props.numVertices === 0) {
                // Only nodata values so empty the BufferGeometry
                this.setAttribute('uv', new BufferAttribute(new Float32Array([]), 2));
                this.setAttribute('position', new BufferAttribute(new Float32Array([]), 3));
                this.setIndex(new BufferAttribute(new Uint16Array([]), 1));
                return;
            }
            this.computeBuffersNoData(props, data);
        } else {
            this.computeBuffers(props, data);
        }
    }
}

export default TileGeometry;
