import DEMUtils from '../../../src/utils/DEMUtils.js';

describe('DEMUtils', () => {
    describe('convertUVtoPixelsCoords', () => {
        it('should return correct pixels coords with flipY is false', () => {
            const texture = {
                image: {
                    width: 256,
                    height: 371,
                },
                flipY: false,
            };

            expect(DEMUtils.convertUVtoPixelsCoords(texture, 0, 0)).toEqual({ x: 0, y: 0 });
            expect(DEMUtils.convertUVtoPixelsCoords(texture, 1, 1)).toEqual({ x: 256, y: 371 });
            expect(DEMUtils.convertUVtoPixelsCoords(texture, 0.3, 0.3)).toEqual({ x: 77, y: 111 });
        });

        it('should return correct pixels coords with flipY is true', () => {
            const texture = {
                image: {
                    width: 256,
                    height: 371,
                },
                flipY: true,
            };

            expect(DEMUtils.convertUVtoPixelsCoords(texture, 0, 0)).toEqual({ x: 0, y: 371 });
            expect(DEMUtils.convertUVtoPixelsCoords(texture, 1, 1)).toEqual({ x: 256, y: 0 });
            expect(DEMUtils.convertUVtoPixelsCoords(texture, 0.3, 0.3)).toEqual({ x: 77, y: 260 });
        });
    });
});
