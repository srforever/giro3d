/**
 * The various states supported by a material (more precisely its fragment shader).
 *
 * @enum
 */
const RenderingState = {
    /** @type {number} The normal state. */
    FINAL: 0,
    /** @type {number} The fragment shader outputs the fragment depth. */
    DEPTH: 1,
    /** @type {number} The fragment shader outputs the mesh's ID. */
    ID: 2,
    /** @type {number} The fragment shader outputs the UV of the fragment. */
    UV: 3,
};

export default RenderingState;
