import CanvasComposer from '../../../../src/renderer/composition/CanvasComposer.js';
import Rect from '../../../../src/core/Rect.js';

describe('CanvasComposer', () => {
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
            const canvas = new CanvasComposer(
                {
                    canvas: makeMockCanvas(256, 256),
                    extent: new Rect(0, 0, 0, 0),
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
            const bottomLeftQuadrant = new Rect(0, 10, 0, 10);
            const canvas = new CanvasComposer(
                {
                    canvas: makeMockCanvas(256, 256),
                    extent: bottomLeftQuadrant,
                },
            );

            const image = {};
            const imageExtent = new Rect(0, 5, 0, 5);
            canvas.draw(image, imageExtent);

            expect(canvas.context.drawImage)
                .toHaveBeenCalledWith(image, 0, 128, 128, 128);
        });
    });
});
