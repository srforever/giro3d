import { NearestFilter, Texture, WebGLRenderer } from 'three';
import Rect from '../core/Rect.js';
import ColorMap from '../core/layer/ColorMap.js';
import WebGLComposer from './composition/WebGLComposer.js';

/**
 * Combines color map textures into a single one.
 * This is necessary to avoid consuming too many texture units.
 */
class ColorMapAtlas {
    /**
     * @param {WebGLRenderer} renderer The renderer
     */
    constructor(renderer) {
        /** @type {Map<ColorMap, object>} */
        this._colorMaps = new Map();
        this._texture = null;
        this._dirty = false;
        this._renderer = renderer;
    }

    /**
     * Adds a color map to the atlas.
     *
     * @param {ColorMap} colorMap The color map.
     */
    add(colorMap) {
        this._colorMaps.set(colorMap, { offset: 0, texture: '' });
        this._dirty = true;
    }

    /**
     * Removes a color map from the atlas.
     *
     * @param {ColorMap} colorMap The color map.
     */
    remove(colorMap) {
        this._colorMaps.delete(colorMap);
        this._dirty = true;
    }

    update() {
        // The atlas should be re-rendered if any colormap texture has changed.
        for (const [colorMap, info] of this._colorMaps.entries()) {
            const texture = colorMap.getTexture();
            if (texture.uuid !== info.texture) {
                this._dirty = true;
                break;
            }
        }
    }

    _createTexture() {
        this._texture?.dispose();
        this._texture = null;

        if (this._colorMaps.size === 0) {
            return;
        }

        // The atlas width is the width of the biggest color map.
        const atlasWidth = Math.max(...[...this._colorMaps.keys()].map(c => c.colors.length));
        // Use 3 pixels in height per color map, to avoid filtering artifacts when using
        // tightly packed 1-pixel textures.
        const atlasHeight = this._colorMaps.size * 3;

        this._atlas = new WebGLComposer({
            extent: new Rect(0, 1, 0, 1),
            width: atlasWidth,
            height: atlasHeight,
            webGLRenderer: this._renderer,
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            reuseTexture: false,
        });

        const height = 1 / this._colorMaps.size;
        let yMin = 0;

        for (const [colorMap, info] of this._colorMaps.entries()) {
            const yMax = yMin + height;

            // Each color map will be rendered as an horizontal stripe of width 100% and height 1/N
            // of the atlas height, where N is the number of color maps to pack into the atlas.
            const rect = new Rect(0, 1, yMin, yMax);

            const texture = colorMap.getTexture();
            this._atlas.draw(colorMap.getTexture(), rect);

            // The offset lies right in the middle pixel of the stripe.
            info.offset = rect.centerY;
            info.texture = texture.uuid;
            yMin = yMax;
        }

        this._texture = this._atlas.render();
        this._atlas.dispose();
        this._dirty = false;
    }

    /**
     * Gets the atlas texture.
     *
     * @type {Texture}
     */
    get texture() {
        if (this._dirty) {
            this._createTexture();
        }
        return this._texture;
    }

    /**
     * Gets the vertical offset for the specified color map.
     *
     * @param {ColorMap} colorMap The color map.
     * @returns {number} The offset.
     */
    getOffset(colorMap) {
        if (this._dirty) {
            this._createTexture();
        }
        return this._colorMaps.get(colorMap)?.offset;
    }

    dispose() {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        this._atlas?.dispose();
        this._texture?.dispose();
        this._colorMaps.clear();
    }
}

export default ColorMapAtlas;
