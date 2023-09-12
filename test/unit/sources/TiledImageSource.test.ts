import Stamen from 'ol/source/Stamen.js';
import GeoTIFFFormat from 'src/formats/GeoTIFFFormat.js';
import TiledImageSource from 'src/sources/TiledImageSource';

describe('TiledImageSource', () => {
    describe('constructor', () => {
        it('should assign properties', () => {
            const containsFn = jest.fn();
            const format = new GeoTIFFFormat();
            const noDataValue = 999;
            const source = new Stamen({ layer: 'watercolor' });

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

        it('should assign flipY to true by default', () => {
            const source = new Stamen({ layer: 'watercolor' });

            const tiled = new TiledImageSource({
                source,
            });

            expect(tiled.flipY).toEqual(true);
        });

        describe.each([true, false])('should assign flipY to the flipY of the format, if provided', b => {
            test(`${b}`, () => {
                const source = new Stamen({ layer: 'watercolor' });

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
        });
    });
});
