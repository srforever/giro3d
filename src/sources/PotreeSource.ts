/**
 * The data source for a [Potree](https://github.com/potree/potree) point cloud.
 */
class PotreeSource {
    readonly isPotreeSource: boolean = true;
    readonly type: string = 'PotreeSource';
    readonly url: string;
    readonly filename: string;
    readonly networkOptions: object;

    /**
     * Creates an instance of PotreeSource.
     *
     * @param url - The URL to the dataset.
     * @param filename - The filename of the dataset.
     * @param networkOptions - The network options.
     */
    constructor(url: string, filename: string = 'cloud.js', networkOptions: object = {}) {
        if (!url) {
            throw new Error('missing url parameter');
        }

        this.url = url;
        this.filename = filename;
        this.networkOptions = networkOptions || {};
    }
}

export default PotreeSource;
