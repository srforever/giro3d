import { Vector3, BufferGeometry } from 'three';

import ColorLayer from '../../../../src/Core/layer/ColorLayer.js';
import TileMesh from '../../../../src/Core/TileMesh.js';
import Extent from '../../../../src/Core/Geographic/Extent.js';
import Map from '../../../../src/entities/Map.js';
import OBB from '../../../../src/Renderer/ThreeExtended/OBB.js';
import LayeredMaterial from '../../../../src/Renderer/LayeredMaterial.js';
import { STRATEGY_MIN_NETWORK_TRAFFIC } from '../../../../src/Core/layer/LayerUpdateStrategy.js';

const assert = require('assert');

describe('ColorLayer', () => {
    describe('constructor', () => {
        it('should throw on undefined id', () => {
            assert.throws(() => new ColorLayer(undefined));
        });

        it('should define layer properties', () => {
            const layer = new ColorLayer('id', { standalone: true });

            assert.strictEqual(layer.frozen, false);
            assert.strictEqual(layer.visible, true);
            assert.strictEqual(layer.opacity, 1.0);
            assert.strictEqual(layer.sequence, 0);
        });
    });

    describe('update', () => {
        // Misc var to initialize a TileMesh instance
        const geom = new BufferGeometry();
        geom.OBB = new OBB(new Vector3(), new Vector3(1, 1, 1));

        const extent = new Extent('EPSG:4326', 0, 2, 0, 2);

        const layer = new ColorLayer(
            'foo',
            {
                extent,
                standalone: true,
            },
        );

        // Mock scheduler
        const context = {
            instance: {
                notifyChange: () => true,
                getLayers: () => [layer],
            },
            scheduler: {
                commands: [],
                execute: cmd => {
                    context.scheduler.commands.push(cmd);
                    return new Promise(() => { /* no-op */ });
                },
            },
        };

        const map = new Map(
            'foo',
            {
                extent: new Extent('EPSG:4326', 0, 0, 0, 0),
            },
        );

        beforeEach(() => {
            // clear commands array
            context.scheduler.commands = [];
            // reset default layer state
            layer.tileInsideLimit = () => true;
            layer.visible = true;
            layer.ready = true;
            layer.updateStrategy = STRATEGY_MIN_NETWORK_TRAFFIC;
            layer.options = {
                zoom: {
                    min: 0,
                    max: 10,
                },
            };
        });

        it('hidden tile should not execute commands', () => {
            const tile = new TileMesh(
                map,
                new LayeredMaterial(
                    {}, {}, { width: 9, height: 9 }, { maxX: 0, maxY: 0, atlas: {} },
                ),
                new Extent('EPSG:4326', 0, 0, 0, 0),
                8,
            );
            tile.material.visible = false;
            tile.material.indexOfColorLayer = () => 0;
            layer.update(context, tile);
            assert.equal(context.scheduler.commands.length, 0);
        });

        it('tile with best texture should not execute commands', () => {
            const tile = new TileMesh(
                map,
                new LayeredMaterial(
                    {}, {}, { width: 9, height: 9 }, { maxX: 0, maxY: 0, atlas: {} },
                ),
                new Extent('EPSG:4326', 0, 0, 0, 0),
                8,
            );
            tile.material.visible = true;
            layer.getPossibleTextureImprovements = () => null;
            layer.update(context, tile);

            assert.equal(context.scheduler.commands.length, 0);
        });

        it('tile with downscaled texture should execute 1 command', () => {
            const tile = new TileMesh(
                map,
                new LayeredMaterial(
                    {}, {}, { maxX: 0, maxY: 0, atlas: {} },
                ),
                new Extent('EPSG:4326', 0, 0, 0, 0),
                8,
                2,
            );
            tile.material.visible = true;

            tile.parent = {
                material: {
                    // eslint-disable-next-line arrow-body-style
                    getColorTexture: () => {
                        return { extent };
                    },
                    uniforms: { colorTexture: { value: 'dummy' } },
                    texturesInfo: { color: { atlasTexture: 'dummy' } },
                },
            };
            layer.getPossibleTextureImprovements = () => ({}); // fake texture update information

            // FIRST PASS: init Node From Parent and get out of the function
            // without any network fetch
            layer.update(context, tile, tile.parent);
            assert.equal(context.scheduler.commands.length, 0);
            // SECOND PASS: Fetch best texture
            layer.update(context, tile, tile.parent);
            assert.equal(context.scheduler.commands.length, 1);
        });
    });
});
