import '../setup.js';
import { DoubleSide, FrontSide } from 'three';
import LayeredMaterial from '../../../src/renderer/LayeredMaterial.js';

const defaultAtlasInfo = { minX: 0, maxX: 1 };
const defaultRenderer = {};

describe('LayeredMaterial', () => {
    describe('constructor', () => {
        it('should assign the correct side', () => {
            const normal = new LayeredMaterial({
                options: {},
                renderer: defaultRenderer,
                atlasInfo: defaultAtlasInfo,
            });
            const ds = new LayeredMaterial({
                options: { doubleSided: true },
                renderer: defaultRenderer,
                atlasInfo: defaultAtlasInfo,
            });

            expect(ds.side).toBe(DoubleSide);
            expect(normal.side).toBe(FrontSide);
        });

        it('should enable the ENABLE_ELEVATION_RANGE define if options has an elevation range', () => {
            const enabled = new LayeredMaterial({
                options: { elevationRange: { min: 0, max: 100 } },
                renderer: defaultRenderer,
                atlasInfo: defaultAtlasInfo,
            });

            expect(enabled.defines.ENABLE_ELEVATION_RANGE).toBeDefined();

            const disabled = new LayeredMaterial({
                options: {},
                renderer: defaultRenderer,
                atlasInfo: defaultAtlasInfo,
            });

            expect(disabled.defines.ENABLE_ELEVATION_RANGE).not.toBeDefined();
        });
    });

    describe('setLayerElevationRange', () => {
        it('should enable the ENABLE_ELEVATION_RANGE define', () => {
            const mat = new LayeredMaterial({
                renderer: defaultRenderer,
                atlasInfo: defaultAtlasInfo,
            });
            expect(mat.defines.ENABLE_ELEVATION_RANGE).not.toBeDefined();

            const layer = {};
            mat.pushColorLayer(layer);

            mat.setLayerElevationRange(layer, { min: 0, max: 100 });
            expect(mat.defines.ENABLE_ELEVATION_RANGE).toBeDefined();
        });
    });
});
