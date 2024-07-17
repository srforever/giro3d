/**
 * Trait for objects that need to handle rendering context loss and restoration.
 */
export default interface RenderingContextHandler {
    /**
     * Called when the rendering context has been lost.
     * @param options - The options.
     */
    onRenderingContextLost(options: {
        /**
         * The canvas holding the restored rendering context.
         */
        canvas: HTMLCanvasElement;
    }): void;
    /**
     * Called when the rendering context has been restored.
     * @param options - The options.
     */
    onRenderingContextRestored(options: {
        /**
         * The canvas holding the restored rendering context.
         */
        canvas: HTMLCanvasElement;
    }): void;
}
