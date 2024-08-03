import type { BufferGeometry, IUniform, Object3D, WebGLRenderer } from 'three';
import { Material, ShaderMaterial, Texture } from 'three';
import TextureGenerator from '../utils/TextureGenerator';

export type MemoryUsageReport = {
    cpuMemory: number;
    gpuMemory: number;
};

export type GetMemoryUsageContext = {
    renderer: WebGLRenderer;
};

/**
 * Trait of objects that can report their memory usage.
 */
export default interface MemoryUsage {
    /**
     * Returns an approximation of the memory used by this object, in bytes.
     * @param context - The graphics context.
     * @param target - If specified, the values computed during this call must be added to the existing
     * values in the target. Otherwise, a new report must be built.
     * @returns The memory usage report. If {@link target} is specified, then this must be returned.
     */
    getMemoryUsage(context: GetMemoryUsageContext, target?: MemoryUsageReport): MemoryUsageReport;
}

export function createEmptyReport(): MemoryUsageReport {
    return { gpuMemory: 0, cpuMemory: 0 };
}

export const KILOBYTE = 1024;
export const MEGABYTE = 1024 * KILOBYTE;
export const GIGABYTE = 1024 * MEGABYTE;

/**
 * Formats the byte count into a readable string.
 * @param bytes - The number of bytes.
 * @param locale - The locale parameter. Default is the current locale.
 * @returns A formatted string using either the specified locale, or the current locale.
 */
export function format(bytes: number, locale?: string): string {
    const numberFormat = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
    });

    let unit: string;
    let value: number;
    if (bytes > GIGABYTE) {
        value = bytes / GIGABYTE;
        unit = 'GB';
    } else if (bytes > MEGABYTE) {
        value = bytes / MEGABYTE;
        unit = 'MB';
    } else if (bytes > KILOBYTE) {
        value = bytes / KILOBYTE;
        unit = 'KB';
    } else {
        value = bytes;
        unit = 'B';
    }

    return `${numberFormat.format(value)} ${unit}`;
}

function isBufferGeometry(obj: unknown): obj is BufferGeometry {
    return (obj as BufferGeometry)?.isBufferGeometry;
}

function iterateMaterials(obj: unknown, callback: (material: Material) => void) {
    const withMaterials = obj as { material: Material | Material[] };

    if (!withMaterials.material) {
        return;
    }

    if (withMaterials.material instanceof Material) {
        callback(withMaterials.material);
    } else if (Array.isArray(withMaterials.material)) {
        for (const m of withMaterials.material) {
            if (m instanceof Material) {
                callback(m);
            }
        }
    }
}

export function getObject3DMemoryUsage(
    object3d: Object3D,
    context: GetMemoryUsageContext,
    target?: MemoryUsageReport,
): MemoryUsageReport {
    const result = target ?? createEmptyReport();

    if ('geometry' in object3d && isBufferGeometry(object3d.geometry)) {
        getGeometryMemoryUsage(object3d.geometry, result);
    }

    iterateMaterials(object3d, material => {
        getMaterialMemoryUsage(material, context, result);
    });

    return result;
}

export function getUniformMemoryUsage(
    uniform: IUniform,
    context: GetMemoryUsageContext,
    target?: MemoryUsageReport,
): MemoryUsageReport {
    const result = target ?? createEmptyReport();

    const value = uniform.value;

    if (value instanceof Texture) {
        TextureGenerator.getMemoryUsage(value, context, result);
    }

    return result;
}

export function getMaterialMemoryUsage(
    material: Material,
    context: GetMemoryUsageContext,
    target?: MemoryUsageReport,
): MemoryUsageReport {
    const result = target ?? createEmptyReport();

    if (material instanceof ShaderMaterial) {
        for (const uniform of Object.values(material.uniforms)) {
            getUniformMemoryUsage(uniform, context, result);
        }
    }
    // TODO other kinds of materials

    return result;
}

export function getGeometryMemoryUsage(
    geometry: BufferGeometry,
    target?: MemoryUsageReport,
): MemoryUsageReport {
    const result = target ?? createEmptyReport();

    let bytes = 0;

    for (const attributeName of Object.keys(geometry.attributes)) {
        bytes += geometry.getAttribute(attributeName).array.byteLength;
    }

    if (geometry.index) {
        bytes += geometry.index.array.byteLength;
    }

    result.gpuMemory += bytes;
    result.cpuMemory += bytes;

    return result;
}
