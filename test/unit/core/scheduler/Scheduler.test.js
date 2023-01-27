import assert from 'assert';
import Scheduler from '../../../../src/core/scheduler/Scheduler.js';

const scheduler = new Scheduler();

const instance = {
    notifyChange: () => {},
};

function makeCmd(layerId = 'foo', prio = 0) {
    return {
        layer: {
            id: layerId,
            priority: prio,
        },
        instance,
        fn: () => Promise.resolve(true),
    };
}

describe('Command execution', () => {
    it('should execute one command', () => scheduler.execute(makeCmd()).then(r => {
        assert.ok(r);
    }));

    it('should execute 100 commands', () => {
        const promises = [];
        for (let i = 0; i < 100; i++) {
            promises.push(scheduler.execute(makeCmd()));
        }

        return Promise.all(promises).then(results => {
            for (const r of results) {
                assert.ok(r);
            }
        });
    });

    it('should execute balance commands between layers', () => {
        const results = [];
        const promises = [];
        for (let i = 0; i < 50; i++) {
            promises.push(scheduler.execute(makeCmd('layer0', 1)).then(
                () => { results.push('layer0'); },
            ));
            promises.push(scheduler.execute(makeCmd('layer1', 5)).then(
                () => { results.push('layer1'); },
            ));
            promises.push(scheduler.execute(makeCmd('layer2', 10)).then(
                () => { results.push('layer2'); },
            ));
        }

        return Promise.all(promises).then(() => {
            // layer2 commands must be all finished before layer1 commands
            assert.ok(results.lastIndexOf('layer2') < results.lastIndexOf('layer1'));
            // layer1 commands must be all finished before layer0 commands
            assert.ok(results.lastIndexOf('layer1') < results.lastIndexOf('layer0'));
        });
    });
});
