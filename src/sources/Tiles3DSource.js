/**
 * @module sources/Tiles3DSource
 */

/**
 * Options for the fetch API.
 *
 * @typedef {object} NetworkOptions
 * @property {string} crossOrigin Specifies the cross origin policy.
 * @api
 */

/**
 * The source to feed a {@linkcode module:entities/Tiles3D~Tiles3D} entity.
 *
 * @api
 */
class Tiles3DSource {
    /**
     * @param {string} url The URL to the root tileset.
     * @param {NetworkOptions} networkOptions the network options.
     * @api
     */
    constructor(url, networkOptions) {
        /** @type {string} */
        this.url = url;
        /** @type {NetworkOptions} */
        this.networkOptions = networkOptions;
    }
}

export default Tiles3DSource;
