/**
 * The various states supported by a material (more precisely its fragment shader).
 */
enum RenderingState {
    /** The normal state. */
    FINAL = 0,
    /**
     * The fragment shader outputs (ID, Z, U, V) without encoding.
     * Requires a 32-bit floating point render target.
     */
    PICKING = 1,
}

export default RenderingState;
