import Entity from '../../../src/entities/Entity.js';

describe('Entity', () => {
    /** @type {Entity} */
    let entity;

    beforeEach(() => {
        entity = new Entity('myEntity');
    });

    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new Entity(undefined)).toThrow(/Missing id parameter/);
        });

        it('should assign the id property', () => {
            expect(entity.id).toEqual('myEntity');
        });

        it('defines the update, preUpdate, postUpdate methods', () => {
            expect(entity.update).toBeDefined();
            expect(entity.update).not.toThrow();

            expect(entity.preUpdate).toBeDefined();
            expect(entity.preUpdate).not.toThrow();

            expect(entity.postUpdate).toBeDefined();
            expect(entity.postUpdate).not.toThrow();
        });
    });

    describe('frozen', () => {
        it('should return the value', () => {
            entity.frozen = true;

            expect(entity.frozen).toEqual(true);
        });

        it('should raise an event only if the value has changed', () => {
            const listener = jest.fn();
            entity.addEventListener('frozen-property-changed', listener);

            entity.frozen = true;
            entity.frozen = true;
            entity.frozen = true;
            expect(listener).toHaveBeenCalledTimes(1);
            entity.frozen = false;
            expect(listener).toHaveBeenCalledTimes(2);
        });
    });
});
