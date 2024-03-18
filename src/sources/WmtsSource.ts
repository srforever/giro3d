import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS.js';
import { Fetcher } from '../utils';
import type { TiledImageSourceOptions } from './TiledImageSource';
import TiledImageSource from './TiledImageSource';
import type { ImageSourceOptions } from './ImageSource';
import type { ImageFormat } from '../formats';
import type Extent from '../core/geographic/Extent';
import { GlobalCache } from '../core/Cache';
import { DefaultQueue } from '../core/RequestQueue';

export interface WmtsSourceOptions extends ImageSourceOptions {
    /**
     * The optional no-data value.
     */
    noDataValue?: number;
    /**
     * The optional image decoder.
     */
    format?: ImageFormat;
    /**
     * The optional extent of the source. If not provided, it will be computed from the source.
     */
    extent?: Extent;
}

export interface WmtsFromCapabilitiesOptions extends WmtsSourceOptions {
    /** The name of the layer. */
    layer: string;
    /** The tile matrix set identifier. */
    matrixSet: string;
    /**
     * The image format (i.e its MIME type, like `image/png`).
     * Note that it is different from the format decoder (that uses the `format` property)
     */
    imageFormat?: string;
}

async function getCapabilities(url: string): Promise<unknown> {
    const cached = GlobalCache.get(url);

    if (cached) {
        return cached;
    }

    const parser = new WMTSCapabilities();

    const res = await Fetcher.fetch(url);
    const text = await res.text();

    const capabilities = parser.read(text);

    GlobalCache.set(url, capabilities);

    return capabilities;
}

/**
 * A {@link TiledImageSource} backed by a single [WMTS](https://en.wikipedia.org/wiki/Web_Map_Tile_Service) layer.
 * Note: this is a convenient class that simplifies the usage of {@link TiledImageSource}.
 *
 * Currently, it is not possible to directly create a `WmtsSource` from its constructor. Use the
 * {@link fromCapabilities} static method to build a source from a WMTS capabilities document.
 */
export default class WmtsSource extends TiledImageSource {
    readonly type: string = 'WmtsSource';
    readonly isWmtsSource = true;

    // Note: constructor is private because currently the only way to build a WMTS layer
    // is from the capabilities.
    private constructor(options: TiledImageSourceOptions) {
        super(options);
    }

    /**
     * Constructs a {@link WmtsSource} from a WMTS capabilities document.
     *
     * @param url - The URL to the WMTS capabilities document.
     * @param options - Source options.
     * @returns A promise that resolve with the created {@link WmtsSource}.
     * ```js
     * const url = 'http://example.com/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities';
     *
     * // Creates the source with layer 'MyLayer' in the 'PM' tile matrix set.
     * const wmtsSource = await WmtsSource.fromCapabilities(url, {
     *   layer: 'MyLayer',
     *   matrixSet: 'PM',
     *   imageFormat: 'image/png',
     * });
     * ```
     */
    static async fromCapabilities(
        url: string,
        options: WmtsFromCapabilitiesOptions,
    ): Promise<WmtsSource> {
        // We use the queue to deduplicate download to the same document.
        const capabilities = await DefaultQueue.enqueue({
            id: url,
            request: () => getCapabilities(url),
        });

        // Warning: optionsFromCapabilities() is very sensitive to properties being undefined,
        // so we must define an additional config object that does not contain undefined properties.
        const config: Record<string, unknown> = {
            layer: options.layer,
        };
        delete options.layer;

        if (options.matrixSet) {
            config.matrixSet = options.matrixSet;
            delete options.matrixSet;
        }
        if (options.imageFormat) {
            config.format = options.imageFormat;
            delete options.imageFormat;
        }

        const olOptions = optionsFromCapabilities(capabilities, config);

        return new WmtsSource({
            source: new WMTS(olOptions),
            ...options,
        });
    }
}
