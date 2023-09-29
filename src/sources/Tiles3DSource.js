/**
 * @module sources/Tiles3DSource
 */

/**
 * Options for the fetch API.
 *
 * @typedef {object} NetworkOptions
 * @property {string} crossOrigin Specifies the cross origin policy.
 */

/**
 * The source to feed a {@linkcode module:entities/Tiles3D~Tiles3D} entity.
 *
 */
class Tiles3DSource {
    /**
     * @param {string} url The URL to the root tileset.
     * @param {NetworkOptions} [networkOptions] the network options.
     */
    constructor(url, networkOptions) {
        this.isTiles3DSource = true;
        this.type = 'Tiles3DSource';

        /** @type {string} */
        this.url = url;
        /** @type {NetworkOptions} */
        this.networkOptions = networkOptions;
    }
}

export default Tiles3DSource;
