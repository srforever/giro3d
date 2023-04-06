import fs from 'fs';
import path from 'path';
import { cwd } from 'process';
import { Blob } from 'node:buffer';
import BilFormat from '../../../src/formats/BilFormat.js';

describe('BilFormat', () => {
    const format = new BilFormat();

    describe('constructor', () => {
        it('should set flipY to true', () => {
            expect(format.flipY).toBeTruthy();
        });
    });

    describe('decode', () => {
        it('should return a correctly constructed texture', async () => {
            // NOTE: file generated with
            // with open(r'./example.bil', mode='wb') as f:
            //    f.write(struct.pack(''.join(['f' for i in range(0, 16)]),
            //                        *[1+i*1.5 for i in range(0, 16)]))
            const buf = fs.readFileSync(path.join(cwd(), 'test/data/example.bil'));
            const blob = new Blob([buf], { type: 'image/x-bil;bits=32' });
            // create a mock layer
            const options = {
                noDataValue: -99999,
                width: 4,
                height: 4,
            };
            const texture = await format.decode(blob, options);

            expect(texture.image.data).toEqual(new Float32Array([
                1.0, 1.0, 1.0, 1,
                2.5, 2.5, 2.5, 1,
                4.0, 4.0, 4.0, 1,
                5.5, 5.5, 5.5, 1,
                7.0, 7.0, 7.0, 1,
                8.5, 8.5, 8.5, 1,
                10.0, 10.0, 10.0, 1,
                11.5, 11.5, 11.5, 1,
                13.0, 13.0, 13.0, 1,
                14.5, 14.5, 14.5, 1,
                16.0, 16.0, 16.0, 1,
                17.5, 17.5, 17.5, 1,
                19.0, 19.0, 19.0, 1,
                20.5, 20.5, 20.5, 1,
                22.0, 22.0, 22.0, 1,
                23.5, 23.5, 23.5, 1,
            ]));
        });
        it('should interpret noDataValue as less or equal than layer.noDataValue', async () => {
            // NOTE: file generated with
            // with open(r'./example.bil', mode='wb') as f:
            //    f.write(struct.pack(''.join(['f' for i in range(0, 16)]),
            //                        *[1+i*1.5 for i in range(0, 16)]))
            const buf = fs.readFileSync(path.join(cwd(), 'test/data/example.bil'));
            const blob = new Blob([buf], { type: 'image/x-bil;bits=32' });
            // create a mock layer
            const options = {
                noDataValue: 10.0,
                width: 4,
                height: 4,
            };
            const texture = await format.decode(blob, options);

            expect(texture.image.data).toEqual(new Float32Array([
                0.00, 0.00, 0.00, 0,
                0.00, 0.00, 0.00, 0,
                0.00, 0.00, 0.00, 0,
                0.00, 0.00, 0.00, 0,
                0.00, 0.00, 0.00, 0,
                0.00, 0.00, 0.00, 0,
                0.00, 0.00, 0.00, 0,
                11.5, 11.5, 11.5, 1,
                13.0, 13.0, 13.0, 1,
                14.5, 14.5, 14.5, 1,
                16.0, 16.0, 16.0, 1,
                17.5, 17.5, 17.5, 1,
                19.0, 19.0, 19.0, 1,
                20.5, 20.5, 20.5, 1,
                22.0, 22.0, 22.0, 1,
                23.5, 23.5, 23.5, 1,
            ]));
        });
    });
});
