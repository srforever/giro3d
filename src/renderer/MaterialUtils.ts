import { type Material } from 'three';

/**
 * Sets or unsets a define directive according to the condition.
 * The material is updated only if the directive has changed, avoiding unnecessary recompilations.
 *
 * @param material - The material to update.
 * @param name - The name of the directive
 * @param condition - The condition to enable the directive.
 * @example
 *
 * setDefine(mat, 'ENABLE_FOO', true); // material.needsUpdate === true;
 * setDefine(mat, 'ENABLE_FOO', true); // material.needsUpdate === false;
 * setDefine(mat, 'ENABLE_FOO', false); // material.needsUpdate === true;
 */
function setDefine<M extends Material, K extends keyof M['defines']>(
    material: M,
    name: K,
    condition: boolean,
) {
    const key = name as string;
    if (material.defines[key] === undefined) {
        if (condition) {
            material.defines[key] = 1;
            material.needsUpdate = true;
        }
    } else if (!condition) {
        delete material.defines[key];
        material.needsUpdate = true;
    }
}

/**
 * Sets or unsets a numerical define directive.
 * The material is updated only if the value has changed, avoiding unnecessary recompilations.
 *
 * @param material - The material to update.
 * @param name - The name of the directive
 * @param value - The value of the define.
 * @returns `true` if the define value has actually changed, `false` otherwise.
 * @example
 *
 * setNumericDefine(mat, 'FOO_COUNT', 5); // material.needsUpdate === true;
 * setNumericDefine(mat, 'FOO_COUNT', 5); // material.needsUpdate === false;
 * setNumericDefine(mat, 'FOO_COUNT', 4); // material.needsUpdate === true;
 */
function setNumericDefine<M extends Material, K extends keyof M['defines']>(
    material: M,
    name: K,
    value?: number,
): boolean {
    const key = name as string;
    const changed = material.defines[key] !== value;

    if (value != null) {
        material.defines[key] = value;
    } else {
        delete material.defines[key];
    }

    if (changed) {
        material.needsUpdate = true;
    }

    return changed;
}

export default {
    setDefine,
    setNumericDefine,
};
