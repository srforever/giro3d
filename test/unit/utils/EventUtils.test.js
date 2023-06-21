import EventUtils from '../../../src/utils/EventUtils.js';

describe('createPropertyChangedEvent', () => {
    it('should return the correct event type', () => {
        const target = {};
        const event = EventUtils.createPropertyChangedEvent(target, 'foo', 0, 1);

        expect(event.type).toEqual('foo-property-changed');
    });

    it('should return the correct target', () => {
        const target = { id: 'target' };
        const event = EventUtils.createPropertyChangedEvent(target, 'foo', 0, 1);

        expect(event.target).toBe(target);
    });

    it('should return the previous and new values', () => {
        const target = { id: 'target' };
        const event = EventUtils.createPropertyChangedEvent(target, 'foo', 0, 1);

        expect(event.previous.foo).toEqual(0);
        expect(event.new.foo).toEqual(1);
    });
});
