/**
 * Exposes rendering options for the current Giro3D instance.
 *
 */
class RenderingOptions {
    /**
     * Enables EDL (Eye Dome Lighting) effect for point clouds.
     *
     * @default false
     */
    enableEDL: boolean;
    /**
     * The intensity of the EDL effect.
     *
     * @default 0.7
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    EDLStrength: number;
    /**
     * The radius of the EDL effect.
     *
     * @default 1.5
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    EDLRadius = 1.5;
    /**
     * Enables inpainting (hole filling) effect for point clouds.
     *
     * @default false
     */
    enableInpainting = false;
    /**
     * The number of inpainting steps.
     *
     * @default 2
     */
    inpaintingSteps: number;
    /**
     * How much the difference of depth between two pixels contribute to the inpainting weight.
     *
     * @default 0.5
     */
    inpaintingDepthContribution: number;
    /**
     * Enables point cloud occlusion effect.
     *
     * @default false
     */
    enablePointCloudOcclusion: boolean;

    constructor() {
        this.enableEDL = false;
        this.EDLStrength = 0.7;
        this.EDLRadius = 1.5;
        this.enableInpainting = false;
        this.inpaintingSteps = 2;
        this.inpaintingDepthContribution = 0.5;
        this.enablePointCloudOcclusion = false;
    }
}

export default RenderingOptions;
