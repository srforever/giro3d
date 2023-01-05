import assert from 'assert';
import Scheduler from '../../../../src/core/scheduler/Scheduler.js';

const scheduler = new Scheduler();

scheduler.addProtocolProvider('test', {
    preprocessDataLayer: () => {
    },
    executeCommand: cmd => {
        setTimeout(() => {
            cmd.done = true;
            cmd._r(cmd);
        }, 0);
        return new Promise(resolve => {
            cmd._r = resolve;
        });
    },
});

const instance = {
    notifyChange: () => {},
};

function makeCmd(layerId = 'foo', prio = 0) {
    return {
        layer: {
            id: layerId,
            protocol: 'test',
            priority: prio,
        },
        instance,
    };
}

describe('Command execution', () => {
    it('should execute one command', done => {
        scheduler.execute(makeCmd()).then(c => {
            assert.ok(c.done);
            done();
        });
    });

    it('should execute 100 commands', done => {
        const promises = [];
        for (let i = 0; i < 100; i++) {
            promises.push(scheduler.execute(makeCmd()));
        }

        Promise.all(promises).then(commands => {
            for (const cmd of commands) {
                assert.ok(cmd.done);
            }
            done();
        });
    });

    it('should execute balance commands between layers', done => {
        const results = [];
        const promises = [];
        for (let i = 0; i < 50; i++) {
            promises.push(scheduler.execute(makeCmd('layer0', 1)).then(
                c => { results.push(c.layer.id); },
            ));
            promises.push(scheduler.execute(makeCmd('layer1', 5)).then(
                c => { results.push(c.layer.id); },
            ));
            promises.push(scheduler.execute(makeCmd('layer2', 10)).then(
                c => { results.push(c.layer.id); },
            ));
        }

        Promise.all(promises).then(() => {
            // layer2 commands must be all finished before layer1 commands
            assert.ok(results.lastIndexOf('layer2') < results.lastIndexOf('layer1'));
            // layer1 commands must be all finished before layer0 commands
            assert.ok(results.lastIndexOf('layer1') < results.lastIndexOf('layer0'));
            done();
        });
    });
});
