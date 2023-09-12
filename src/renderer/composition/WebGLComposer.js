/** @module renderer/composition/WebGLComposer */
import {
    WebGLRenderTarget,
    OrthographicCamera,
    Scene,
    Mesh,
    Texture,
    PlaneGeometry,
    WebGLRenderer,
    RGBAFormat,
    UnsignedByteType,
    ClampToEdgeWrapping,
    LinearFilter,
    Color,
    Vector4,
    MathUtils,
} from 'three';
import Interpretation from '../../core/layer/Interpretation';

import Rect from '../../core/Rect.js';
import TextureGenerator from '../../utils/TextureGenerator';
import MemoryTracker from '../MemoryTracker.js';
import ComposerTileMaterial from './ComposerTileMaterial.js';

/** @type {PlaneGeometry} */
let SHARED_PLANE_GEOMETRY = null;

const IMAGE_Z = -10;
const textureOwners = new Map();
const NEAR = 1;
const FAR = 100;
const DEFAULT_CLEAR = new Color(0, 0, 0);

function processTextureDisposal(event) {
    const texture = event.target;
    texture.removeEventListener('dispose', processTextureDisposal);
    const owner = textureOwners.get(texture.uuid);
    if (owner) {
        owner.dispose();
        textureOwners.delete(texture.uuid);
    } else {
        // This should never happen
        console.error('no owner for ', texture);
    }
}

/**
 * An implementation of the composer that uses a WebGL renderer.
 * This has many advantages over the {@link module:Renderer/composition/CanvasComposer}:
 * - Supports arbitrary pixel types (from 8-bit to 32-bit floating point)
 * - Supports arbitrary fragment shaders
 *
 * However, it is slower than its counterpart.
 *
 * @class WebGLComposer
 */
class WebGLComposer {
    /**
     * Creates an instance of WebGLComposer.
     *
     * @param {object} options The options.
     * @param {Rect} [options.extent] Optional extent of the canvas. If undefined, then the canvas
     * is an infinite plane.
     * @param {number} options.width The canvas width, in pixels.
     * Ignored if a canvas is provided.
     * @param {number} options.height The canvas height, in pixels.
     * Ignored if a canvas is provided.
     * @param {boolean} [options.showImageOutlines=false] If true, yellow image outlines
     * will be drawn on images.
     * @param {boolean} [options.reuseTexture=false] If true, this composer will try to reuse the
     * same texture accross renders. Note that this may not be always possible if the texture format
     * has to change due to incompatible images to draw. For example, if the current target is
     * has 8-bit pixels, and a 32-bit texture must be drawn onto the canvas, the underlying target
     * will have to be recreated in 32-bit format.
     * @param {boolean} [options.createDataCopy=false] If true, rendered textures will have a `data`
     * property containing the texture data (an array of either floats or bytes).
     * This is useful to read back the texture content.
     * @param {number} [options.minFilter=undefined] The minification filter of the generated
     * texture. Default is `LinearFilter`.
     * @param {number} [options.magFilter=undefined] The magnification filter of the generated
     * texture. Default is `LinearFilter`.
     * @param {boolean|{noDataValue: number}} [options.computeMinMax] If true, rendered textures
     * will have a `min` and a `max` property containing the minimum and maximum value.
     * This only applies to grayscale data (typically elevation data). If the option is an object
     * with the `noDataValue` property, all pixels with this value will be ignored for min/max
     * computation.
     * @param {WebGLRenderer} options.webGLRenderer The WebGL renderer to use. This must be the
     * same renderer as the one used to display the rendered textures, because WebGL contexts are
     * isolated from each other.
     * @param {"ColorRepresentation"} [options.clearColor=undefined] The clear (background) color.
     */
    constructor(options) {
        this.showImageOutlines = options.showImageOutlines;
        this.extent = options.extent;
        this.width = options.width;
        this.height = options.height;
        this.renderer = options.webGLRenderer;
        this.createDataCopy = options.createDataCopy;
        this.reuseTexture = options.reuseTexture;
        this.clearColor = options.clearColor;
        this.computeMinMax = options.computeMinMax;
        this.minFilter = options.minFilter || LinearFilter;
        this.magFilter = options.magFilter || LinearFilter;
        if (!SHARED_PLANE_GEOMETRY) {
            SHARED_PLANE_GEOMETRY = new PlaneGeometry(1, 1, 1, 1);
            MemoryTracker.track(SHARED_PLANE_GEOMETRY, 'WebGLComposer - PlaneGeometry');
        }

        // An array containing textures that this composer has created, to be disposed later.
        this.ownedTextures = [];

        this.scene = new Scene();

        // Define a camera centered on (0, 0), with its
        // orthographic size matching size of the extent.
        this.camera = new OrthographicCamera();
        this.camera.near = NEAR;
        this.camera.far = FAR;

        if (this.extent) {
            this._setCameraRect(this.extent);
        }
    }

    /**
     * Sets the camera frustum to the specified rect.
     *
     * @param {Rect} rect The rect.
     */
    _setCameraRect(rect) {
        const halfWidth = rect.width / 2;
        const halfHeight = rect.height / 2;

        this.camera.position.set(rect.centerX, rect.centerY, 0);

        this.camera.left = -halfWidth;
        this.camera.right = +halfWidth;
        this.camera.top = +halfHeight;
        this.camera.bottom = -halfHeight;

        this.camera.updateProjectionMatrix();
    }

    _createRenderTarget(pixelType, format, width, height) {
        const result = new WebGLRenderTarget(
            width,
            height, {
                format,
                anisotropy: this.renderer.capabilities.getMaxAnisotropy(),
                magFilter: this.magFilter,
                minFilter: this.minFilter,
                type: pixelType,
                depthBuffer: false,
                generateMipmaps: true,
            },
        );

        // Normally, the render target "owns" the texture, and whenever this target
        // is disposed, the texture is disposed with it.
        // However, in our case, we cannot rely on this behaviour because the owner is the composer
        // itself, whose lifetime can be shorter than the texture it created.
        textureOwners.set(result.texture.uuid, result);
        result.texture.addEventListener('dispose', processTextureDisposal);
        result.texture.name = 'WebGLComposer texture';

        MemoryTracker.track(result, 'WebGLRenderTarget');
        MemoryTracker.track(result.texture, 'WebGLRenderTarget.texture');

        return result;
    }

    /**
     * Draws an image to the composer.
     *
     * @param {Texture|HTMLImageElement|HTMLCanvasElement} texture The texture to add.
     * @param {Rect} extent The extent of this texture in the composition space.
     * @param {object} [options] The options.
     * @param {Interpretation} [options.interpretation=Interpretation.Raw] The pixel interpretation.
     * @param {number} [options.zOrder=0] The Z-order of the texture in the composition space.
     * @param {number} [options.fadeDuration=0] The fade duration of the image.
     * @param {boolean} [options.flipY] Flip the image vertically.
     * @param {boolean} [options.fillNoData] Fill no-data values of the image.
     * @param {boolean} [options.transparent] Should the image be transparent.
     * @returns {Mesh} The image mesh object.
     */
    draw(texture, extent, options = {}) {
        const plane = new Mesh(SHARED_PLANE_GEOMETRY, null);
        MemoryTracker.track(plane, 'WebGLComposer - mesh');
        plane.scale.set(extent.width, extent.height, 1);
        this.scene.add(plane);

        const x = extent.centerX;
        const y = extent.centerY;

        plane.position.set(x, y, 0);

        return this.drawMesh(texture, plane, options);
    }

    /**
     * Draws a texture on a custom mesh to the composer.
     *
     * @param {Texture|HTMLImageElement|HTMLCanvasElement} texture The texture to add.
     * @param {Mesh} mesh The custom mesh.
     * @param {object} [options] The options.
     * @param {Interpretation} [options.interpretation=Interpretation.Raw] The pixel interpretation.
     * @param {number} [options.zOrder=0] The Z-order of the texture in the composition space.
     * @param {number} [options.fadeDuration=0] The fade duration of the image.
     * @param {boolean} [options.flipY] Flip the image vertically.
     * @param {boolean} [options.fillNoData] Fill no-data values of the image.
     * @param {boolean} [options.transparent] Should the image be transparent.
     * @returns {Mesh} The image mesh object.
     */
    drawMesh(texture, mesh, options = {}) {
        if (!texture.isTexture) {
            texture = new Texture(texture);
            texture.needsUpdate = true;
            this.ownedTextures.push(texture);
            MemoryTracker.track(texture, 'WebGLComposer - owned texture');
        }
        const interpretation = options.interpretation ?? Interpretation.Raw;
        const material = ComposerTileMaterial.acquire({
            texture,
            fillNoData: options.fillNoData,
            interpretation,
            flipY: options.flipY,
            fadeDuration: options.fadeDuration,
            transparent: options.transparent,
            showImageOutlines: this.showImageOutlines,
        });
        MemoryTracker.track(material, 'WebGLComposer - material');

        mesh.material = material;

        const z = IMAGE_Z + (options.zOrder ?? 0);
        mesh.position.setZ(z);

        this.scene.add(mesh);

        mesh.updateMatrixWorld(true);
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldAutoUpdate = false;

        return mesh;
    }

    remove(mesh) {
        ComposerTileMaterial.release(mesh.material);
        this.scene.remove(mesh);
    }

    /**
     * Resets the composer to a blank state.
     *
     * @memberof WebGLComposer
     */
    reset() {
        this._removeTextures();
        this._removeObjects();
    }

    _removeObjects() {
        const childrenCopy = [...this.scene.children];
        for (const child of childrenCopy) {
            ComposerTileMaterial.release(child.material);
            this.scene.remove(child);
        }
    }

    /**
     * @typedef {object} TypeFormat
     * @property {"TextureDataType"} type The data type.
     * @property {"PixelFormat"} format The pixel format.
     */

    /**
     * @returns {TypeFormat} the type and formats
     */
    _selectPixelTypeAndTextureFormat() {
        let type = UnsignedByteType;
        let format = RGBAFormat;
        let currentBpp = -1;
        let currentChannelCount = -1;

        this.scene.traverse(o => {
            if (o.material !== undefined && o.material instanceof ComposerTileMaterial) {
                /** @type {ComposerTileMaterial} */
                const mat = o.material;
                const bpp = TextureGenerator.getBytesPerChannel(mat.dataType);
                if (bpp > currentBpp) {
                    currentBpp = bpp;
                    type = mat.dataType;
                }
                const channelCount = TextureGenerator.getChannelCount(mat.pixelFormat);
                if (channelCount > currentChannelCount) {
                    format = mat.pixelFormat;
                    currentChannelCount = channelCount;
                }
            }
        });

        return { type, format };
    }

    saveState() {
        return {
            clearAlpha: this.renderer.getClearAlpha(),
            renderTarget: this.renderer.getRenderTarget(),
            scissorTest: this.renderer.getScissorTest(),
            scissor: this.renderer.getScissor(new Vector4()),
            clearColor: this.renderer.getClearColor(new Color()),
            viewport: this.renderer.getViewport(new Vector4()),
        };
    }

    restoreState(state) {
        this.renderer.setClearAlpha(state.clearAlpha);
        this.renderer.setRenderTarget(state.renderTarget);
        this.renderer.setScissorTest(state.scissorTest);
        this.renderer.setScissor(state.scissor);
        this.renderer.setClearColor(state.clearColor, state.clearAlpha);
        this.renderer.setViewport(state.viewport);
    }

    /**
     * Renders the composer into a texture.
     *
     * @param {object} opts The options.
     * @param {Rect} [opts.rect] A custom rect for the camera.
     * @param {number} [opts.width] The width, in pixels, of the output texture.
     * @param {number} [opts.height] The height, in pixels, of the output texture.
     * @param {boolean} [opts.computeMinMax] Compute min/max on the output texture.
     * @param {WebGLRenderTarget} [opts.target] The render target.
     * @returns {Texture} The texture of the render target.
     */
    render(opts = {}) {
        const width = opts.width ?? this.width;
        const height = opts.height ?? this.height;

        // Should we reuse the same render target or create a new one ?
        let target;
        if (opts.target) {
            target = opts.target;
        } else {
            // select the best data type and format according to
            // currently drawn images and constraints
            const { type, format } = this._selectPixelTypeAndTextureFormat();

            if (!this.reuseTexture) {
                // We create a new render target for this render
                target = this._createRenderTarget(type, format, width, height);
            } else {
                // We reuse the same render target across all renders, but if the format changes,
                // we still have to recreate a new texture.
                if (this.renderTarget === undefined
                    || type !== this.renderTarget.texture.type
                    || format !== this.renderTarget.texture.format) {
                    this.renderTarget?.dispose();
                    this.renderTarget = this._createRenderTarget(
                        type,
                        format,
                        this.width,
                        this.height,
                    );
                }

                target = this.renderTarget;
            }
        }

        const previousState = this.saveState();

        if (this.clearColor) {
            this.renderer.setClearColor(this.clearColor);
        } else {
            this.renderer.setClearColor(DEFAULT_CLEAR, 0);
        }
        this.renderer.setRenderTarget(target);
        this.renderer.setViewport(0, 0, target.width, target.height);
        this.renderer.clear();

        const rect = opts.rect ?? this.extent;
        if (!rect) {
            throw new Error('no rect provided and no default rect to setup camera');
        }
        this._setCameraRect(rect);

        // If the requested rectangle is not the same as the extent of this composer,
        // then it is a partial render.
        // We need to scissor the output in order to render only the overlap between
        // the requested extent and the extent of this composer.
        if (this.extent && opts.rect && !opts.rect.equals(this.extent)) {
            this.renderer.setScissorTest(true);
            const intersection = this.extent.getIntersection(opts.rect);
            const sRect = Rect.getNormalizedRect(intersection, opts.rect);

            // The pixel margin is necessary to avoid bleeding
            // when textures use linear interpolation.
            const pixelMargin = 1;
            const sx = Math.floor(sRect.x * width - pixelMargin);
            const sy = Math.floor((1 - sRect.y - sRect.h) * height - pixelMargin);
            const sw = Math.ceil(sRect.w * width + 2 * pixelMargin);
            const sh = Math.ceil(sRect.h * height + 2 * pixelMargin);

            this.renderer.setScissor(
                MathUtils.clamp(sx, 0, width),
                MathUtils.clamp(sy, 0, height),
                MathUtils.clamp(sw, 0, width),
                MathUtils.clamp(sh, 0, height),
            );
        }
        this.renderer.render(this.scene, this.camera);

        const result = target.texture;

        if (opts.computeMinMax || this.createDataCopy || this.computeMinMax) {
            TextureGenerator.createDataCopy(target, this.renderer);

            if (this.computeMinMax || opts.computeMinMax) {
                const noDataValue = this.computeMinMax?.noDataValue
                    ?? opts.computeMinMax?.noDataValue;

                const { min, max } = TextureGenerator.computeMinMax(
                    result.data,
                    noDataValue,
                );
                result.min = min;
                result.max = max;

                if (!this.createDataCopy) {
                    delete result.data;
                }
            }
        }

        target.texture.wrapS = ClampToEdgeWrapping;
        target.texture.wrapT = ClampToEdgeWrapping;
        target.texture.generateMipmaps = false;

        this.restoreState(previousState);

        return target.texture;
    }

    _removeTextures() {
        this.ownedTextures.forEach(t => t.dispose());
        this.ownedTextures.length = 0;
    }

    /**
     * Disposes all unmanaged resources in this composer.
     */
    dispose() {
        this._removeTextures();
        this._removeObjects();
        if (this.renderTarget) {
            this.renderTarget.dispose();
        }
    }
}

export default WebGLComposer;
