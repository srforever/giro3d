import Entity from '../../../src/entities/Entity.js';

describe('Entity', () => {
    describe('constructor', () => {
        it('should throw on undefined id', () => {
            expect(() => new Entity(undefined)).toThrow(/Missing id parameter/);
        });
    });
});
