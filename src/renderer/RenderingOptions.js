/**
 * @module renderer/RenderingOptions
 */

/**
 * Exposes rendering options for the current Giro3D instance.
 *
 * @api
 */
class RenderingOptions {
    constructor() {
        /**
         * Enables EDL (Eye Dome Lighting) effect for point clouds.
         *
         * @api
         * @type {boolean}
         */
        this.enableEDL = false;

        /**
         * The intensity of the EDL effect.
         *
         * @api
         * @type {number}
         */
        this.EDLStrength = 0.7;

        /**
         * The radius of the EDL effect.
         *
         * @api
         * @type {number}
         */
        this.EDLRadius = 1.5;

        /**
         * Enables inpainting (hole filling) effect for point clouds.
         *
         * @api
         * @type {boolean}
         */
        this.enableInpainting = false;

        /**
         * The number of inpainting steps.
         *
         * @api
         * @type {number}
         */
        this.inpaintingSteps = 2;

        /**
         * How much the difference of depth between two pixels contribute to the inpainting weight.
         *
         * @api
         * @type {number}
         */
        this.inpaintingDepthContribution = 0.5;

        /**
         * Enables point cloud occlusion effect.
         *
         * @api
         * @type {boolean}
         */
        this.enablePointCloudOcclusion = false;
    }
}

export default RenderingOptions;
