import CogSource, {
    type CogSourceOptions,
    type CogCacheOptions,
} from './CogSource';
import ImageSource, {
    type GetImageOptions,
    type ImageSourceOptions,
    type ImageResponse,
    type CustomContainsFn,
    type ImageResult,
    type ImageSourceEvents,
} from './ImageSource';
import TiledImageSource, {
    type TiledImageSourceOptions,
} from './TiledImageSource';
import Tiles3DSource from './Tiles3DSource';
import VectorSource, {
    type VectorSourceOptions,
} from './VectorSource';
import VectorTileSource, {
    type VectorTileSourceOptions,
} from './VectorTileSource';
import PotreeSource from './PotreeSource';
import WmtsSource, { type WmtsSourceOptions, type WmtsFromCapabilitiesOptions } from './WmtsSource';
import WmsSource, { type WmsSourceOptions } from './WmsSource';

/**
 * Data sources.
 */
export {
    ImageSource,
    ImageSourceOptions,
    GetImageOptions,
    ImageResponse,
    CustomContainsFn,
    ImageResult,
    ImageSourceEvents,
    Tiles3DSource,
    VectorSource,
    VectorSourceOptions,
    VectorTileSource,
    VectorTileSourceOptions,
    PotreeSource,
    TiledImageSource,
    TiledImageSourceOptions,
    CogSource,
    CogSourceOptions,
    CogCacheOptions,
    WmtsSource,
    WmtsSourceOptions,
    WmtsFromCapabilitiesOptions,
    WmsSource,
    WmsSourceOptions,
};
