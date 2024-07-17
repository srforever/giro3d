import '../setup.js';
import { DoubleSide, FrontSide, UnsignedByteType, Vector2, type WebGLRenderer } from 'three';
import LayeredMaterial from 'src/renderer/LayeredMaterial';
import Extent from 'src/core/geographic/Extent';
import type ColorLayer from 'src/core/layer/ColorLayer';

// @ts-expect-error incomplete type
const defaultRenderer: WebGLRenderer = {};
const textureSize = new Vector2(256, 256);
const extent = new Extent('EPSG:3857', 0, 10, 0, 10);

describe('LayeredMaterial', () => {
    describe('constructor', () => {
        it('should assign the correct side', () => {
            const normal = new LayeredMaterial({
                options: {},
                extent,
                renderer: defaultRenderer,
                maxTextureImageUnits: 8,
                isGlobe: false,
                getIndexFn: () => 0,
                hasElevationLayer: false,
                textureSize,
                textureDataType: UnsignedByteType,
            });
            const ds = new LayeredMaterial({
                options: { doubleSided: true },
                extent,
                renderer: defaultRenderer,
                maxTextureImageUnits: 8,
                isGlobe: false,
                getIndexFn: () => 0,
                hasElevationLayer: false,
                textureSize,
                textureDataType: UnsignedByteType,
            });

            expect(ds.side).toBe(DoubleSide);
            expect(normal.side).toBe(FrontSide);
        });

        it('should enable the ENABLE_ELEVATION_RANGE define if options has an elevation range', () => {
            const enabled = new LayeredMaterial({
                options: { elevationRange: { min: 0, max: 100 } },
                extent,
                renderer: defaultRenderer,
                maxTextureImageUnits: 8,
                isGlobe: false,
                getIndexFn: () => 0,
                hasElevationLayer: false,
                textureSize,
                textureDataType: UnsignedByteType,
            });

            expect(enabled.defines.ENABLE_ELEVATION_RANGE).toBeDefined();

            const disabled = new LayeredMaterial({
                options: {},
                extent,
                renderer: defaultRenderer,
                maxTextureImageUnits: 8,
                isGlobe: false,
                getIndexFn: () => 0,
                hasElevationLayer: false,
                textureSize,
                textureDataType: UnsignedByteType,
            });

            expect(disabled.defines.ENABLE_ELEVATION_RANGE).not.toBeDefined();
        });

        it('should enable the STITCHING define if options has stitching enabled', () => {
            const enabled = new LayeredMaterial({
                options: {
                    terrain: {
                        enabled: true,
                        stitching: true,
                    },
                },
                extent,
                renderer: defaultRenderer,
                maxTextureImageUnits: 8,
                isGlobe: false,
                getIndexFn: () => 0,
                hasElevationLayer: false,
                textureSize,
                textureDataType: UnsignedByteType,
            });

            expect(enabled.defines.STITCHING).toBeDefined();

            const disabled = new LayeredMaterial({
                options: {
                    terrain: {
                        enabled: true,
                        stitching: false,
                    },
                },
                extent,
                renderer: defaultRenderer,
                maxTextureImageUnits: 8,
                isGlobe: false,
                getIndexFn: () => 0,
                hasElevationLayer: false,
                textureSize,
                textureDataType: UnsignedByteType,
            });

            expect(disabled.defines.STITCHING).not.toBeDefined();
        });

        it('should enable the TERRAIN_DEFORMATION define if options has it enabled', () => {
            const enabled = new LayeredMaterial({
                options: {
                    terrain: {
                        enabled: true,
                    },
                },
                extent,
                renderer: defaultRenderer,
                maxTextureImageUnits: 8,
                isGlobe: false,
                getIndexFn: () => 0,
                hasElevationLayer: false,
                textureSize,
                textureDataType: UnsignedByteType,
            });

            expect(enabled.defines.TERRAIN_DEFORMATION).toBeDefined();

            const disabled = new LayeredMaterial({
                options: {
                    terrain: {
                        enabled: false,
                    },
                },
                extent,
                renderer: defaultRenderer,
                maxTextureImageUnits: 8,
                isGlobe: false,
                getIndexFn: () => 0,
                hasElevationLayer: false,
                textureSize,
                textureDataType: UnsignedByteType,
            });

            expect(disabled.defines.TERRAIN_DEFORMATION).not.toBeDefined();
        });
    });

    describe('setLayerElevationRange', () => {
        it('should enable the ENABLE_ELEVATION_RANGE define', () => {
            const mat = new LayeredMaterial({
                renderer: defaultRenderer,
                textureDataType: UnsignedByteType,
                extent,
                maxTextureImageUnits: 8,
                isGlobe: false,
                getIndexFn: () => 0,
                hasElevationLayer: false,
                options: {},
                textureSize,
            });
            expect(mat.defines.ENABLE_ELEVATION_RANGE).not.toBeDefined();

            // @ts-expect-error incomplete type
            const layer: ColorLayer = {
                getRenderTargetDataType: () => UnsignedByteType,
                resolutionFactor: 1,
            };
            mat.pushColorLayer(layer, null);

            mat.setLayerElevationRange(layer, { min: 0, max: 100 });
            expect(mat.defines.ENABLE_ELEVATION_RANGE).toBeDefined();
        });
    });
});
