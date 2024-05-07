import {
    Vector3,
    BufferAttribute,
    BufferGeometry,
    FloatType,
    IntType,
    type TypedArray,
    type AttributeGPUType,
} from 'three';
import type { Accessor, BatchTable } from './BatchTableParser';
import BatchTableParser from './BatchTableParser';
import utf8Decoder from '../utils/Utf8Decoder';

export type Pnts = {
    point: {
        geometry?: BufferGeometry;
        offset?: Vector3;
    };
    batchTable: BatchTable;
};

// https://github.com/CesiumGS/3d-tiles/tree/main/specification/TileFormats/PointCloud#global-semantics
type GlobalSemantics = {
    // Mandatory
    POINTS_LENGTH: number;

    // Optional
    BATCH_LENGTH?: number;
    RTC_CENTER?: [number, number, number];
    CONSTANT_RGBA?: [number, number, number, number];
    QUANTIZED_VOLUME_OFFSET?: [number, number, number];
    QUANTIZED_VOLUME_SCALE?: [number, number, number];
};

// https://github.com/CesiumGS/3d-tiles/tree/main/specification/TileFormats/PointCloud#point-semantics
type PerPointSemantics = {
    POSITION?: Accessor<'VEC3', 'FLOAT'>;
    RGB?: Accessor<'VEC3', 'UNSIGNED_BYTE'>;
    RGBA?: Accessor<'VEC4', 'UNSIGNED_BYTE'>;
    RGB565?: Accessor<'SCALAR', 'UNSIGNED_SHORT'>;
    NORMAL?: Accessor<'VEC3', 'FLOAT'>;
    NORMAL_OCT16P?: Accessor<'VEC2', 'UNSIGNED_BYTE'>;
    BATCH_ID?: Accessor<'SCALAR', 'UNSIGNED_BYTE' | 'UNSIGNED_SHORT' | 'UNSIGNED_INT'>;
    POSITION_QUANTIZED?: Accessor<'VEC3', 'UNSIGNED_SHORT'>;
};

type FeatureTable = GlobalSemantics & PerPointSemantics;

function getGpuType(accessor: Accessor): AttributeGPUType {
    switch (accessor.componentType) {
        case 'BYTE':
        case 'UNSIGNED_BYTE':
        case 'SHORT':
        case 'UNSIGNED_SHORT':
        case 'INT':
        case 'UNSIGNED_INT':
            return IntType;
        case 'FLOAT':
        case 'DOUBLE':
            return FloatType;
        default:
            throw new Error(`unsupported component type: ${accessor.componentType}`);
    }
}

function createTypedArray(buffer: ArrayBuffer, length: number, accessor: Accessor): TypedArray {
    switch (accessor.componentType) {
        case 'BYTE':
            return new Int8Array(buffer, accessor.byteOffset, length);
        case 'UNSIGNED_BYTE':
            return new Uint8Array(buffer, accessor.byteOffset, length);
        case 'SHORT':
            return new Int16Array(buffer, accessor.byteOffset, length);
        case 'UNSIGNED_SHORT':
            return new Uint16Array(buffer, accessor.byteOffset, length);
        case 'INT':
            return new Int32Array(buffer, accessor.byteOffset, length);
        case 'UNSIGNED_INT':
            return new Uint32Array(buffer, accessor.byteOffset, length);
        case 'FLOAT':
            return new Float32Array(buffer, accessor.byteOffset, length);
        case 'DOUBLE':
            return new Float64Array(buffer, accessor.byteOffset, length);
        default:
            throw new Error(`unsupported component type: ${accessor.componentType}`);
    }
}

function getBufferAttribute(
    length: number,
    accessor: Accessor,
    buffer: ArrayBuffer,
): BufferAttribute {
    const typedArray = createTypedArray(buffer, length, accessor);
    const result = new BufferAttribute(typedArray, getComponentCount(accessor));

    // This is very important because putting a float type instead
    // of an int type will prevent the shader from compiling.
    result.gpuType = getGpuType(accessor);

    return result;
}

function parseFeatureBinary(array: ArrayBuffer, byteOffset: number, FTJSONLength: number) {
    // Init geometry
    const geometry = new BufferGeometry();

    // init Array feature binary
    const subArrayJson = utf8Decoder.decode(new Uint8Array(array, byteOffset, FTJSONLength));
    const featureTable: FeatureTable = JSON.parse(subArrayJson);

    const pointCount = featureTable.POINTS_LENGTH;

    if (featureTable.POSITION) {
        const byteOffsetPos = featureTable.POSITION.byteOffset + subArrayJson.length + byteOffset;
        const positionArray = new Float32Array(array, byteOffsetPos, pointCount * 3);
        geometry.setAttribute('position', new BufferAttribute(positionArray, 3));
    }
    if (featureTable.RGB) {
        const byteOffsetCol = featureTable.RGB.byteOffset + subArrayJson.length + byteOffset;
        const colorArray = new Uint8Array(array, byteOffsetCol, pointCount * 3);
        geometry.setAttribute('color', new BufferAttribute(colorArray, 3, true));
    }
    if (featureTable.POSITION_QUANTIZED) {
        throw new Error('For pnts loader, POSITION_QUANTIZED: not yet managed');
    }
    if (featureTable.RGBA) {
        throw new Error('For pnts loader, RGBA: not yet managed');
    }
    if (featureTable.RGB565) {
        throw new Error('For pnts loader, RGB565: not yet managed');
    }
    if (featureTable.NORMAL) {
        throw new Error('For pnts loader, NORMAL: not yet managed');
    }
    if (featureTable.NORMAL_OCT16P) {
        throw new Error('For pnts loader, NORMAL_OCT16P: not yet managed');
    }
    if (featureTable.BATCH_ID) {
        throw new Error('For pnts loader, BATCH_ID: not yet managed');
    }

    // Add RTC feature
    const offset = featureTable.RTC_CENTER
        ? new Vector3().fromArray(featureTable.RTC_CENTER)
        : undefined;

    return {
        count: pointCount,
        geometry,
        offset,
    };
}

function getComponentCount(accessor: Accessor): number {
    switch (accessor.type) {
        case 'SCALAR':
            return 1;
        case 'VEC2':
            return 2;
        case 'VEC3':
            return 3;
        case 'VEC4':
            return 4;
        default:
            throw new Error(`unsupported component type: ${accessor.type}`);
    }
}

export default {
    /**
     * Parse pnts buffer and extract Points and batch table
     *
     * @param buffer - the pnts buffer.
     * @returns a promise that resolves with an object containig a Points (point)
     * and a batch table (batchTable).
     */
    parse: async function parse(buffer: ArrayBuffer): Promise<Pnts> {
        if (!buffer) {
            throw new Error('No array buffer provided.');
        }
        const view = new DataView(buffer);

        let byteOffset = 0;
        const pntsHeader: Record<string, number> = {};

        let batchTable: BatchTable = {};

        let point: {
            count?: number;
            geometry?: BufferGeometry;
            offset?: Vector3;
        } = {};

        // Magic type is unsigned char [4]
        const magic = utf8Decoder.decode(new Uint8Array(buffer, byteOffset, 4));

        if (magic !== 'pnts') {
            throw new Error(`invalid .pnts file. Expected 'pnts' magic number, got: ${magic}`);
        }

        byteOffset += 4;

        // Version, byteLength, batchTableJSONByteLength, batchTableBinaryByteLength and
        // batchTable types are uint32
        pntsHeader.version = view.getUint32(byteOffset, true);
        byteOffset += Uint32Array.BYTES_PER_ELEMENT;

        pntsHeader.byteLength = view.getUint32(byteOffset, true);
        byteOffset += Uint32Array.BYTES_PER_ELEMENT;

        pntsHeader.FTJSONLength = view.getUint32(byteOffset, true);
        byteOffset += Uint32Array.BYTES_PER_ELEMENT;

        pntsHeader.FTBinaryLength = view.getUint32(byteOffset, true);
        byteOffset += Uint32Array.BYTES_PER_ELEMENT;

        pntsHeader.BTJSONLength = view.getUint32(byteOffset, true);
        byteOffset += Uint32Array.BYTES_PER_ELEMENT;

        pntsHeader.BTBinaryLength = view.getUint32(byteOffset, true);
        byteOffset += Uint32Array.BYTES_PER_ELEMENT;

        // binary table
        if (pntsHeader.FTBinaryLength > 0) {
            point = parseFeatureBinary(buffer, byteOffset, pntsHeader.FTJSONLength);
            byteOffset += pntsHeader.FTJSONLength + pntsHeader.FTBinaryLength;
        }

        // batch table
        if (pntsHeader.BTJSONLength > 0) {
            batchTable = await BatchTableParser.parse(
                buffer.slice(byteOffset, byteOffset + pntsHeader.BTJSONLength),
            );

            byteOffset += pntsHeader.BTJSONLength;

            if (pntsHeader.BTBinaryLength > 0) {
                const binaryBatchTable = buffer.slice(
                    byteOffset,
                    byteOffset + pntsHeader.BTBinaryLength,
                );

                for (const [name, accessor] of Object.entries(batchTable)) {
                    const attributeName = name.toLowerCase();

                    const attribute = getBufferAttribute(point.count, accessor, binaryBatchTable);

                    // Helpful mainly for debugging purposes
                    attribute.name = attributeName;

                    point.geometry.setAttribute(attributeName, attribute);
                }
            }
        }

        const pnts = { point, batchTable };

        return Promise.resolve(pnts);
    },
};
