import GeoJSON from 'ol/format/GeoJSON.js';
import { Style } from 'ol/style.js';
import VectorSource from '../../../src/sources/VectorSource.js';

describe('VectorSource', () => {
    describe('setStyle', () => {
        let source;

        beforeEach(() => {
            source = new VectorSource({ data: 'http://example.com/geojson', format: new GeoJSON() });
        });

        it('should trigger an update', () => {
            const listener = jest.fn();
            source.addEventListener('updated', listener);

            source.setStyle(() => {});

            expect(listener).toHaveBeenCalled();
        });

        it('should assign the style', () => {
            const style = new Style();
            source.setStyle(style);
            expect(source.style).toBe(style);
        });
    });
});
