import GeographicCanvas, { toCanvasNormalizedCoordinates } from '../../../src/utils/GeographicCanvas.js';
import Extent from '../../../src/Core/Geographic/Extent.js';

describe('GeographicCanvas', () => {
    function makeMockCanvas(width = 256, height = 256) {
        const context = {
            drawImage: jest.fn(),
            getImageData: jest.fn(),
        };
        const result = {
            width,
            height,
            _ctx: context,
            getContext: () => context,
        };
        return result;
    }

    describe('getImageData', () => {
        it('should return the correct size', () => {
            const canvas = new GeographicCanvas(
                {
                    canvas: makeMockCanvas(256, 256),
                    extent: new Extent('EPSG:4326', 0, 0, 0, 0),
                },
            );

            const expected = {};
            canvas.canvas._ctx.getImageData.mockReturnValueOnce(expected);
            const actual = canvas.getImageData();
            expect(canvas.canvas._ctx.getImageData).toHaveBeenCalledWith(0, 0, 256, 256);
            expect(actual).toBe(expected);
        });
    });

    describe('draw', () => {
        it('should call drawImage with correct values', () => {
            const bottomLeftQuadrant = new Extent('EPSG:4326', 0, 10, 0, 10);
            const canvas = new GeographicCanvas(
                {
                    canvas: makeMockCanvas(256, 256),
                    extent: bottomLeftQuadrant,
                },
            );

            const image = {};
            const imageExtent = new Extent('EPSG:4326', 0, 5, 0, 5);
            canvas.draw(image, imageExtent);

            expect(canvas.context.drawImage)
                .toHaveBeenCalledWith(image, 0, 128, 128, 128);
        });
    });

    describe('toCanvasNormalizedCoordinates', () => {
        it('should return 0 0 1 1 if both extents are the same', () => {
            const extent = new Extent('EPSG:4326', 1, 10, 2, 20);
            const canvas = new GeographicCanvas({ canvas: makeMockCanvas(), extent });
            const {
                x, y, w, h,
            } = toCanvasNormalizedCoordinates(extent, canvas);

            expect(x).toBe(0);
            expect(y).toBe(0);
            expect(w).toBe(1);
            expect(h).toBe(1);
        });

        it('should return 0 0.5 0.5 0.5 if source is the bottom left quadrant', () => {
            const source = new Extent('EPSG:4326', 0, 10, 0, 10);
            const dest = new Extent('EPSG:4326', 0, 20, 0, 20);
            const canvas = new GeographicCanvas({ canvas: makeMockCanvas(), extent: dest });
            const {
                x, y, w, h,
            } = toCanvasNormalizedCoordinates(source, canvas);

            expect(x).toBe(0);
            expect(y).toBe(0.5);
            expect(w).toBe(0.5);
            expect(h).toBe(0.5);
        });

        it('should return 0 0 0.5 0.5 if source is the top left quadrant', () => {
            const source = new Extent('EPSG:4326', 0, 10, 10, 20);
            const dest = new Extent('EPSG:4326', 0, 20, 0, 20);
            const canvas = new GeographicCanvas({ canvas: makeMockCanvas(), extent: dest });
            const {
                x, y, w, h,
            } = toCanvasNormalizedCoordinates(source, canvas);

            expect(x).toBe(0);
            expect(y).toBe(0);
            expect(w).toBe(0.5);
            expect(h).toBe(0.5);
        });

        it('should return 0.5 0.5 0.5 0.5 if source is the bottom right quadrant', () => {
            const source = new Extent('EPSG:4326', 10, 20, 0, 10);
            const dest = new Extent('EPSG:4326', 0, 20, 0, 20);
            const canvas = new GeographicCanvas({ canvas: makeMockCanvas(), extent: dest });
            const {
                x, y, w, h,
            } = toCanvasNormalizedCoordinates(source, canvas);

            expect(x).toBe(0.5);
            expect(y).toBe(0.5);
            expect(w).toBe(0.5);
            expect(h).toBe(0.5);
        });

        it('should return 0.5 0 0.5 0.5 if source is the top right quadrant', () => {
            const source = new Extent('EPSG:4326', 10, 20, 10, 20);
            const dest = new Extent('EPSG:4326', 0, 20, 0, 20);
            const canvas = new GeographicCanvas({ canvas: makeMockCanvas(), extent: dest });
            const {
                x, y, w, h,
            } = toCanvasNormalizedCoordinates(source, canvas);

            expect(x).toBe(0.5);
            expect(y).toBe(0);
            expect(w).toBe(0.5);
            expect(h).toBe(0.5);
        });

        it('should return -0.5 -0.5 2 2 if source is twice as big as dest, and centered', () => {
            const source = new Extent('EPSG:4326', -10, 30, -10, 30);
            const dest = new Extent('EPSG:4326', 0, 20, 0, 20);
            const canvas = new GeographicCanvas({ canvas: makeMockCanvas(), extent: dest });
            const {
                x, y, w, h,
            } = toCanvasNormalizedCoordinates(source, canvas);

            expect(x).toBe(-0.5);
            expect(y).toBe(-0.5);
            expect(w).toBe(2);
            expect(h).toBe(2);
        });
    });
});
