import StadiaMaps from 'ol/source/StadiaMaps.js';
import GeoTIFFFormat from 'src/formats/GeoTIFFFormat';
import TiledImageSource from 'src/sources/TiledImageSource';

describe('TiledImageSource', () => {
    describe('constructor', () => {
        it('should assign properties', () => {
            const containsFn = jest.fn();
            const format = new GeoTIFFFormat();
            const noDataValue = 999;
            const source = new StadiaMaps({ layer: 'stamen_watercolor' });

            const tiled = new TiledImageSource({
                source,
                containsFn,
                format,
                noDataValue,
            });

            expect(tiled.format).toBe(format);
            expect(tiled.containsFn).toBe(containsFn);
            expect(tiled.noDataValue).toEqual(noDataValue);
            expect(tiled.source).toBe(source);
        });

        it('should assign flipY to false by default, as flipping is handled internally', () => {
            const source = new StadiaMaps({ layer: 'stamen_watercolor' });

            const tiled = new TiledImageSource({
                source,
            });

            expect(tiled.flipY).toEqual(false);
        });

        describe.each([true, false])(
            'should assign flipY to the flipY of the format, if provided',
            b => {
                test(`${b}`, () => {
                    const source = new StadiaMaps({ layer: 'stamen_watercolor' });

                    const flipY = b;

                    const tiled = new TiledImageSource({
                        source,
                        format: {
                            flipY,
                            isImageFormat: false,
                            type: '',
                            decode: jest.fn(),
                        },
                    });

                    expect(tiled.flipY).toEqual(flipY);
                });
            },
        );
    });
});
