import { ClampToEdgeWrapping, Color, NearestFilter, RGBAFormat, UnsignedByteType } from 'three';
import ColorMap from '../../../../src/core/layer/ColorMap';
import ColorMapMode from '../../../../src/core/layer/ColorMapMode';

describe('ColorMap', () => {
    describe('constructor', () => {
        it('should set default properties', () => {
            const cm = new ColorMap([], 0, 1);

            expect(cm.mode).toEqual(ColorMapMode.Elevation);
            expect(cm.active).toEqual(true);
            expect(cm._cachedTexture).toBeNull();
        });

        it('should honor mode', () => {
            const elevation = new ColorMap([], 0, 1, ColorMapMode.Elevation);
            expect(elevation.mode).toEqual(ColorMapMode.Elevation);

            const aspect = new ColorMap([], 0, 1, ColorMapMode.Aspect);
            expect(aspect.mode).toEqual(ColorMapMode.Aspect);

            const slope = new ColorMap([], 0, 1, ColorMapMode.Slope);
            expect(slope.mode).toEqual(ColorMapMode.Slope);
        });

        it('should honor min and max', () => {
            const cm = new ColorMap([], -1312.4, 204242.2);
            expect(cm.min).toEqual(-1312.4);
            expect(cm.max).toEqual(204242.2);
        });

        it('should honor colors', () => {
            const colors = [];
            colors.push(new Color('red'));
            colors.push(new Color('blue'));
            colors.push(new Color('green'));

            const cm = new ColorMap(colors, 0, 1);
            expect(cm.colors).toBe(colors);
        });
    });

    describe('mode', () => {
        it('should set the value of the property', () => {
            const cm = new ColorMap([], 0, 1);

            cm.mode = ColorMapMode.Slope;

            expect(cm.mode).toEqual(ColorMapMode.Slope);
        });
    });

    describe('active', () => {
        it('should set the value of the property', () => {
            const cm = new ColorMap([], 0, 1);

            cm.active = false;
            expect(cm.active).toEqual(false);

            cm.active = true;
            expect(cm.active).toEqual(true);
        });
    });

    describe('min', () => {
        it('should set the value of the property', () => {
            const cm = new ColorMap([], 0, 1);

            cm.min = -34;

            expect(cm.min).toEqual(-34);
        });
    });

    describe('max', () => {
        it('should set the value of the property', () => {
            const cm = new ColorMap([], 0, 1);

            cm.max = 32432;

            expect(cm.max).toEqual(32432);
        });
    });

    describe('colors', () => {
        it('should set the value of the property', () => {
            const cm = new ColorMap([], 0, 1);

            const newValue = [new Color('red')];
            cm.colors = newValue;

            expect(cm.colors).toBe(newValue);
        });

        it('should dispose the cached texture, if any', () => {
            const tex = { dispose: jest.fn() };
            const cm = new ColorMap([], 0, 1);

            cm._cachedTexture = tex;
            const newValue = [new Color('red')];
            cm.colors = newValue;

            expect(tex.dispose).toHaveBeenCalled();
            expect(cm._cachedTexture).toBeNull();
        });
    });

    describe('getTexture', () => {
        it('should return the cached texture, if any', () => {
            const tex = { id: 1 };
            const cm = new ColorMap([], 0, 1);

            cm._cachedTexture = tex;

            expect(cm.getTexture()).toBe(tex);
        });

        it('should return a new texture if cached texture does not exist', () => {
            const colors = [new Color('red'), new Color('white'), new Color('cyan')];
            const cm = new ColorMap(colors, 0, 1);

            const texture = cm.getTexture();

            expect(texture.image.width).toEqual(3);
            expect(texture.image.height).toEqual(1);
            expect(texture.type).toEqual(UnsignedByteType);
            expect(texture.format).toEqual(RGBAFormat);

            const buf = texture.image.data;
            expect(buf).toHaveLength(colors.length * 4);

            // red
            expect(buf[0]).toEqual(255);
            expect(buf[1]).toEqual(0);
            expect(buf[2]).toEqual(0);
            expect(buf[3]).toEqual(255);

            // white
            expect(buf[4]).toEqual(255);
            expect(buf[5]).toEqual(255);
            expect(buf[6]).toEqual(255);
            expect(buf[7]).toEqual(255);

            // cyan
            expect(buf[8]).toEqual(0);
            expect(buf[9]).toEqual(255);
            expect(buf[10]).toEqual(255);
            expect(buf[11]).toEqual(255);
        });

        it('should return a texture with NearestFilter and ClampToEdgeWrapping', () => {
            const colors = [new Color('red'), new Color('white'), new Color('cyan')];
            const cm = new ColorMap(colors, 0, 1);

            const texture = cm.getTexture();

            expect(texture.minFilter).toEqual(NearestFilter);
            expect(texture.magFilter).toEqual(NearestFilter);
            expect(texture.wrapS).toEqual(ClampToEdgeWrapping);
            expect(texture.wrapT).toEqual(ClampToEdgeWrapping);
        });
    });
});
