import Shape from 'src/entities/Shape';

describe('Shape', () => {
    describe('constructor', () => {
        it('should assign id and object3d', () => {
            const shape = new Shape('foo');
            expect(shape.id).toEqual('foo');
            expect(shape.object3d).toBeDefined();
            expect(shape.object3d.type).toEqual('Group');
        });
    });
});
