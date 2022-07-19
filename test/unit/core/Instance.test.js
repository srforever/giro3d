import Extent from '../../../src/Core/Geographic/Extent.js';
import Instance from '../../../src/Core/Instance.js';
import Layer from '../../../src/Core/Layer/Layer.js';
import MainLoop from '../../../src/Core/MainLoop.js';
import { Map } from '../../../src/entities/Map.js';

describe('Instance', () => {
    /** @type {HTMLDivElement} */
    let viewerDiv;

    /** @type {Instance} */
    let instance;

    /** @type {MainLoop} */
    let mainLoop;

    beforeEach(() => {
        viewerDiv = {};
        viewerDiv.appendChild = jest.fn;
        mainLoop = {
            gfxEngine: {
                getWindowSize: jest.fn,
            },
            scheduleUpdate: jest.fn,
            scheduler: {
                getProtocolProvider: jest.fn,
            },
        };
        const options = { mainLoop };
        instance = new Instance(viewerDiv, options);
    });

    describe('getOwner', () => {
        it('should return null if there are no entities', () => {
            const layer = new Layer();
            expect(instance.getOwner(layer)).toBeNull();
        });

        it('should return the correct owner', async () => {
            const provider = { preprocessDataLayer: lyr => { lyr.update = jest.fn; } };
            mainLoop.scheduler.getProtocolProvider = jest.fn(() => provider);

            const notOwner = new Map('not-owner', { extent: new Extent('EPSG:4326', 0, 0, 0, 0) });
            const owner = new Map('owner', { extent: new Extent('EPSG:4326', 0, 0, 0, 0) });

            instance.add(notOwner);
            instance.add(owner);

            const layer = await owner.addLayer({ id: 'my-layer' });

            expect(instance.getOwner(layer)).toBe(owner);
        });
    });
});
