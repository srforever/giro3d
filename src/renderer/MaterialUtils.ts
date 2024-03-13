import { type Material } from 'three';

/**
 * Sets or unsets a define directive according to the condition.
 * The material is updated only if the directive has changed, avoiding unnecessary recompilations.
 *
 * @param material The material to update.
 * @param name The name of the directive
 * @param condition The condition to enable the directive.
 * @example
 *
 * setDefine(mat, 'ENABLE_FOO', true); // material.needsUpdate === true;
 * setDefine(mat, 'ENABLE_FOO', true); // material.needsUpdate === false;
 * setDefine(mat, 'ENABLE_FOO', false); // material.needsUpdate === true;
 */
function setDefine<M extends Material, K extends keyof M['defines']>(material: M, name: K, condition: boolean) {
    // @ts-expect-error
    if (material.defines[name] === undefined) {
        if (condition) {
            // @ts-expect-error
            material.defines[name] = 1;
            material.needsUpdate = true;
        }
    } else if (!condition) {
        // @ts-expect-error
        delete material.defines[name];
        material.needsUpdate = true;
    }
}

export default {
    setDefine,
};
