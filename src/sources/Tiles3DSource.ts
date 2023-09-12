/**
 * The source to feed a `Tiles3D` entity.
 */
class Tiles3DSource {
    readonly isTiles3DSource: boolean = true;
    readonly type: string = 'Tiles3DSource';
    readonly url: string;
    readonly networkOptions: { crossOrigin: string };

    /**
     * @param url The URL to the root tileset.
     * @param networkOptions the network options.
     * @param networkOptions.crossOrigin The CORS policy.
     */
    constructor(url: string, networkOptions?: { crossOrigin: string }) {
        this.url = url;
        this.networkOptions = networkOptions;
    }
}

export default Tiles3DSource;
