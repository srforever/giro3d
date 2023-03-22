import { Material } from 'three';

/**
 * Sets or unsets a define directive according to the condition.
 * The material is updated only if the directive has changed, avoiding unnecessary recompilations.
 *
 * @param {Material} material The material to update.
 * @param {string} name The name of the directive
 * @param {boolean} condition The condition to enable the directive.
 * @example
 *
 * setDefine(mat, 'ENABLE_FOO', true); // material.needsUpdate === true;
 * setDefine(mat, 'ENABLE_FOO', true); // material.needsUpdate === false;
 * setDefine(mat, 'ENABLE_FOO', false); // material.needsUpdate === true;
 */
function setDefine(material, name, condition) {
    if (material.defines[name] === undefined) {
        if (condition) {
            material.defines[name] = 1;
            material.needsUpdate = true;
        }
    } else if (!condition) {
        delete material.defines[name];
        material.needsUpdate = true;
    }
}

export default {
    setDefine,
};
