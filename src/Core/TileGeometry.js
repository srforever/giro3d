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
 * It is implemented for performance and produces simple planar geometries.
 * By default it produces square geometries but providing different width and height
 * allows for rectangular tiles creation.
 *
 * @example
 * // Inspired from Map@requestNewTile
 * const level = 0;
 * const segment = 8;
 * const extent = new Extent('EPSG:3857', -1000, -1000, 1000, 1000);
 * const paramsGeometry = { extent, level, segment };
 * const geometry = new TileGeometry(paramsGeometry);
 * 
 * @param {object} Parameters to construct the grid. Should contain an extent
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
        this.props = this.prepare(params);
        // Compute buffers (no normals because the z displacement is in the shader)
        this.computeBuffers(this.props);
        // Compute the Oriented Bounding Box for spatial operations
        this.computeBoundingBox();
        this.OBB = new OBB(this.boundingBox.min, this.boundingBox.max);
    }

    /**
     * Prepare the grid properties from parameters.
     * 
     * @api
    */
    prepare(params) {
        const width = params.width || params.segment + 1;
        const height = params.height || params.segment + 1;
        const segmentX = width - 1;
        const segmentY = height - 1;
        const uvStepX = 1 / segmentX;
        const uvStepY = 1 / segmentY;
        const dimension = this.extent.dimensions();
        const rowStep = uvStepX * dimension.x;
        const columnStep = uvStepY * -dimension.y;
        const translateX = -segmentX * 0.5 * rowStep;
        const translateY = -segmentY * 0.5 * columnStep;
        return {
            width,
            height,
            segmentX,
            segmentY,
            uvStepX,
            uvStepY,
            rowStep,
            columnStep,
            translateX,
            translateY,
        }
    }

    /**
     * Construct the buffer geometry using a fast rolling approach.
     * 
     * @api
    */
    computeBuffers(props) {
        const numVertices = props.width * props.height;
        const triangles = props.segmentX * props.segmentY * 2;

        const uvs = new Float32Array(numVertices * 2);
        const indices = new Uint32Array(triangles * 3);
        const positions = new Float32Array(numVertices * 3);

        let posX;
        let iPos = 0;
        let uvY = 0.0;
        let indicesNdx = 0;
        let posY = props.translateY;

        // Store xyz position and and corresponding uv of a pixel data. 
        function handleCell() {
            const posNdx = iPos * 3;
            positions[posNdx + 0] = posX * props.rowStep + props.translateX;
            positions[posNdx + 1] = -posY;
            positions[posNdx + 2] = 0.0;
            const uvNdx = iPos * 2;
            uvs[uvNdx + 0] = posX * props.uvStepX;
            uvs[uvNdx + 1] = uvY;
            iPos += 1;
        }

        // Construct indices as two different triangles from a particular vertex.
        // Use previous and aboves while rolling so discard first row (top border)
        // and first data of each row (left border).
        function indicesSimple() {
            const above = iPos - props.width;
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
        for (posX = 0; posX < props.width; posX++) {
            handleCell();
        }
        // Next rows
        //
        for (let h = 1; h < props.height; h++) {
            posY = h * props.columnStep + props.translateY;
            uvY = h * props.uvStepY;
            // First cell
            posX = 0;
            handleCell();
            // Next cells
            for (posX = 1; posX < props.width; posX++) {
                indicesSimple();
                handleCell();
            }
        }

        this.setAttribute('uv', new BufferAttribute(uvs, 2));
        this.setAttribute('position', new BufferAttribute(positions, 3));
        this.setIndex(new BufferAttribute(indices, 1));
    }
}

export default TileGeometry;
