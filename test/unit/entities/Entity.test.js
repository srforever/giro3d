import Entity from '../../../src/entities/Entity.js';

describe('Entity', () => {
    let entity;

    beforeEach(() => {
        entity = new Entity('myEntity');
    });

    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new Entity(undefined)).toThrow(/Missing id parameter/);
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
});
