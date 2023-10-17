import ProjUtils from 'src/utils/ProjUtils';

describe('transformBufferInPlace', () => {
    it('should do nothing if both CRSes are equal', () => {
        const buffer = [0, 1, 2];
        ProjUtils.transformBufferInPlace(buffer, {
            srcCrs: 'EPSG:1234',
            dstCrs: 'EPSG:1234',
            stride: 3,
        });

        expect(buffer).toEqual([0, 1, 2]);
    });

    it('should honor the stride, leaving unrelated values untouched', () => {
        const Z = 99999;
        const W = 12345;
        const vec3Buffer = [
            1.2, 0.2, Z,
            2.3, 10.2, Z,
        ];
        const vec4Buffer = [
            1.2, 0.2, Z, W,
            2.3, 10.2, Z, W,
        ];

        ProjUtils.transformBufferInPlace(vec3Buffer, {
            srcCrs: 'EPSG:4326',
            dstCrs: 'EPSG:3857',
            stride: 3,
        });

        expect(vec3Buffer[0]).toBeCloseTo(133583.38895192827);
        expect(vec3Buffer[1]).toBeCloseTo(22263.943371933852);
        expect(vec3Buffer[2]).toEqual(Z);

        expect(vec3Buffer[3]).toBeCloseTo(256034.82882452922);
        expect(vec3Buffer[4]).toBeCloseTo(1141504.335717432);
        expect(vec3Buffer[5]).toEqual(Z);

        ProjUtils.transformBufferInPlace(vec4Buffer, {
            srcCrs: 'EPSG:4326',
            dstCrs: 'EPSG:3857',
            stride: 4,
        });

        expect(vec4Buffer[0]).toBeCloseTo(133583.38895192827);
        expect(vec4Buffer[1]).toBeCloseTo(22263.943371933852);
        expect(vec4Buffer[2]).toEqual(Z);
        expect(vec4Buffer[3]).toEqual(W);

        expect(vec4Buffer[4]).toBeCloseTo(256034.82882452922);
        expect(vec4Buffer[5]).toBeCloseTo(1141504.335717432);
        expect(vec4Buffer[6]).toEqual(Z);
        expect(vec4Buffer[7]).toEqual(W);
    });

    it('should honor the offsetX and offsetY parameters to offset the initial coordinates', () => {
        const Z = 99999;
        const offsetX = 1;
        const offsetY = 2;
        const buffer = [
            1.2 - offsetX, 0.2 - offsetY, Z,
            2.3 - offsetX, 10.2 - offsetY, Z,
        ];

        ProjUtils.transformBufferInPlace(buffer, {
            srcCrs: 'EPSG:4326',
            dstCrs: 'EPSG:3857',
            offsetX,
            offsetY,
            stride: 3,
        });

        expect(buffer[0]).toBeCloseTo(133583.38895192827);
        expect(buffer[1]).toBeCloseTo(22263.943371933852);
        expect(buffer[2]).toEqual(Z);

        expect(buffer[3]).toBeCloseTo(256034.82882452922);
        expect(buffer[4]).toBeCloseTo(1141504.335717432);
        expect(buffer[5]).toEqual(Z);
    });
});
