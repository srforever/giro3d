import Extent from '../../../src/core/geographic/Extent.js';
import ImageSource from '../../../src/sources/ImageSource.js';

class TestSource extends ImageSource {
    constructor({ extent }) {
        super();
        this.extent = extent;
    }

    getExtent() {
        return this.extent;
    }
}

describe('ImageSource', () => {
    describe('contains', () => {
        it('should use the custom contains function if it exists', () => {
            const customFunction = jest.fn();

            const source = new ImageSource({
                containsFn: customFunction,
            });

            const extentToTest = new Extent('EPSG:3857', 1, 2, 3, 4);

            source.contains(extentToTest);

            expect(customFunction).toHaveBeenCalledWith(extentToTest);
        });

        it('should default to the intersection of the extent and the source extent', () => {
            const sourceExtent = new Extent('EPSG:3857', 0, 10, 0, 10);
            const extentToTest = new Extent('EPSG:3857', 1, 2, 3, 4);

            const source = new TestSource({ extent: sourceExtent });

            expect(source.contains(extentToTest)).toEqual(true);
        });
    });
});
