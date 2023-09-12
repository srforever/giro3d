/**
 * Data sources.
 *
 * @module
 */

import CogSource, {
    type CogSourceOptions,
} from './CogSource';
import ImageSource, {
    type GetImageOptions,
    type ImageSourceOptions,
    type ImageResponse,
    type CustomContainsFn,
    type ImageResult,
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

export {
    ImageSource,
    ImageSourceOptions,
    GetImageOptions,
    ImageResponse,
    CustomContainsFn,
    ImageResult,
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
};
