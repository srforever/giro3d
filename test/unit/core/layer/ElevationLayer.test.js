import ElevationLayer from '../../../../src/Core/layer/ElevationLayer.js';
import { ELEVATION_FORMAT } from '../../../../src/utils/DEMUtils.js';

const assert = require('assert');

describe('ElevationLayer', () => {
    describe('constructor', () => {
        it('should throw on undefined id', () => {
            assert.throws(() => new ElevationLayer(undefined));
        });

        it('should define layer properties', () => {
            const layer = new ElevationLayer('id', { elevationFormat: ELEVATION_FORMAT.MAPBOX_RGB, standalone: true });

            assert.strictEqual(layer.frozen, false);
            assert.strictEqual(layer.elevationFormat, ELEVATION_FORMAT.MAPBOX_RGB);
        });
    });
});
