import {
    WebGLRenderTarget,
    OrthographicCamera,
    Scene,
    Mesh,
    Texture,
    PlaneGeometry,
    type WebGLRenderer,
    RGBAFormat,
    UnsignedByteType,
    ClampToEdgeWrapping,
    LinearFilter,
    Color,
    Vector4,
    MathUtils,
    type ColorRepresentation,
    type AnyPixelFormat,
    type TextureDataType,
    type MinificationTextureFilter,
    type MagnificationTextureFilter,
} from 'three';
import Interpretation from '../../core/layer/Interpretation';

import Rect from '../../core/Rect.js';
import TextureGenerator from '../../utils/TextureGenerator';
import MemoryTracker from '../MemoryTracker.js';
import ComposerTileMaterial from './ComposerTileMaterial';

let SHARED_PLANE_GEOMETRY: PlaneGeometry = null;

const IMAGE_Z = -10;
const textureOwners = new Map();
const NEAR = 1;
const FAR = 100;
const DEFAULT_CLEAR = new Color(0, 0, 0);

export type DrawableImage = Texture | HTMLImageElement | HTMLCanvasElement;

function processTextureDisposal(event: { target: Texture }) {
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

interface SaveState {
    clearAlpha: number;
    renderTarget: WebGLRenderTarget;
    scissorTest: boolean;
    scissor: Vector4;
    clearColor: Color;
    viewport: Vector4;
}

export interface DrawOptions {
    interpretation?: Interpretation;
    zOrder?: number;
    flipY?: boolean;
    fillNoData?: boolean;
    transparent?: boolean;
}

/**
 * Composes images together using a three.js scene and an orthographic camera.
 */
class WebGLComposer {
    private readonly showImageOutlines: boolean;
    private readonly extent: Rect;
    private readonly renderer: WebGLRenderer;
    private readonly reuseTexture: boolean;
    private readonly clearColor: ColorRepresentation;
    private readonly minFilter: MinificationTextureFilter;
    private readonly magFilter: MagnificationTextureFilter;
    private readonly ownedTextures: Texture[];
    private readonly scene: Scene;
    private readonly camera: OrthographicCamera;

    readonly width: number;
    readonly height: number;
    private renderTarget: WebGLRenderTarget;

    /**
     * Creates an instance of WebGLComposer.
     *
     * @param options The options.
     * @param options.extent Optional extent of the canvas. If undefined, then the canvas
     * is an infinite plane.
     * @param options.width The canvas width, in pixels.
     * Ignored if a canvas is provided.
     * @param options.height The canvas height, in pixels.
     * Ignored if a canvas is provided.
     * @param options.showImageOutlines If true, yellow image outlines
     * will be drawn on images.
     * @param options.reuseTexture If true, this composer will try to reuse the
     * same texture accross renders. Note that this may not be always possible if the texture format
     * has to change due to incompatible images to draw. For example, if the current target is
     * has 8-bit pixels, and a 32-bit texture must be drawn onto the canvas, the underlying target
     * will have to be recreated in 32-bit format.
     * @param options.minFilter The minification filter of the generated
     * texture. Default is `LinearFilter`.
     * @param options.magFilter The magnification filter of the generated
     * texture. Default is `LinearFilter`.
     * @param options.webGLRenderer The WebGL renderer to use. This must be the
     * same renderer as the one used to display the rendered textures, because WebGL contexts are
     * isolated from each other.
     * @param options.clearColor The clear (background) color.
     */
    constructor(options: {
        extent?: Rect;
        width?: number;
        height?: number;
        showImageOutlines?: boolean;
        reuseTexture?: boolean;
        minFilter?: MinificationTextureFilter;
        magFilter?: MagnificationTextureFilter;
        webGLRenderer: WebGLRenderer;
        clearColor?: ColorRepresentation
    }) {
        this.showImageOutlines = options.showImageOutlines;
        this.extent = options.extent;
        this.width = options.width;
        this.height = options.height;
        this.renderer = options.webGLRenderer;
        this.reuseTexture = options.reuseTexture;
        this.clearColor = options.clearColor;
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
            this.setCameraRect(this.extent);
        }
    }

    /**
     * Sets the camera frustum to the specified rect.
     *
     * @param rect The rect.
     */
    private setCameraRect(rect: Rect) {
        const halfWidth = rect.width / 2;
        const halfHeight = rect.height / 2;

        this.camera.position.set(rect.centerX, rect.centerY, 0);

        this.camera.left = -halfWidth;
        this.camera.right = +halfWidth;
        this.camera.top = +halfHeight;
        this.camera.bottom = -halfHeight;

        this.camera.updateProjectionMatrix();
    }

    private createRenderTarget(
        type: TextureDataType,
        format: AnyPixelFormat,
        width: number,
        height: number,
    ) {
        const result = new WebGLRenderTarget(
            width,
            height, {
                format,
                anisotropy: this.renderer.capabilities.getMaxAnisotropy(),
                magFilter: this.magFilter,
                minFilter: this.minFilter,
                type,
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
     * @param image The image to add.
     * @param extent The extent of this texture in the composition space.
     * @param options The options.
     */
    draw(image: DrawableImage, extent: Rect, options: DrawOptions = {}) {
        const plane = new Mesh(SHARED_PLANE_GEOMETRY, null);
        MemoryTracker.track(plane, 'WebGLComposer - mesh');
        plane.scale.set(extent.width, extent.height, 1);
        this.scene.add(plane);

        const x = extent.centerX;
        const y = extent.centerY;

        plane.position.set(x, y, 0);

        return this.drawMesh(image, plane, options);
    }

    /**
     * Draws a texture on a custom mesh to the composer.
     *
     * @param image The image to add.
     * @param mesh The custom mesh.
     * @param options Options.
     */
    drawMesh(image: DrawableImage, mesh: Mesh, options: DrawOptions = {}): Mesh {
        let texture: Texture;
        if (!(image as Texture).isTexture) {
            texture = new Texture(image as HTMLImageElement);
            texture.needsUpdate = true;
            this.ownedTextures.push(texture);
            MemoryTracker.track(texture, 'WebGLComposer - owned texture');
        } else {
            texture = image as Texture;
        }
        const interpretation = options.interpretation ?? Interpretation.Raw;
        const material = ComposerTileMaterial.acquire({
            texture,
            fillNoData: options.fillNoData,
            interpretation,
            flipY: options.flipY,
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

    remove(mesh: Mesh) {
        ComposerTileMaterial.release(mesh.material as ComposerTileMaterial);
        this.scene.remove(mesh);
    }

    /**
     * Resets the composer to a blank state.
     */
    reset() {
        this._removeTextures();
        this.removeObjects();
    }

    private removeObjects() {
        const childrenCopy = [...this.scene.children];
        for (const child of childrenCopy) {
            if ((child as Mesh).isMesh) {
                ComposerTileMaterial.release((child as Mesh).material as ComposerTileMaterial);
            }
            this.scene.remove(child);
        }
    }

    private selectPixelTypeAndTextureFormat() {
        let type: TextureDataType = UnsignedByteType;
        let format: AnyPixelFormat = RGBAFormat;
        let currentBpp = -1;
        let currentChannelCount = -1;

        this.scene.traverse(o => {
            const mat = (o as Mesh).material as ComposerTileMaterial;
            if (mat && mat.isComposerTileMaterial) {
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

    private saveState(): SaveState {
        return {
            clearAlpha: this.renderer.getClearAlpha(),
            renderTarget: this.renderer.getRenderTarget(),
            scissorTest: this.renderer.getScissorTest(),
            scissor: this.renderer.getScissor(new Vector4()),
            clearColor: this.renderer.getClearColor(new Color()),
            viewport: this.renderer.getViewport(new Vector4()),
        };
    }

    private restoreState(state: SaveState) {
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
     * @param opts The options.
     * @param opts.rect A custom rect for the camera.
     * @param opts.width The width, in pixels, of the output texture.
     * @param opts.height The height, in pixels, of the output texture.
     * @param opts.target The render target.
     * @returns The texture of the render target.
     */
    render(opts: {
        rect?: Rect;
        width?: number;
        height?: number;
        target?: WebGLRenderTarget;
    } = {}): Texture {
        const width = opts.width ?? this.width;
        const height = opts.height ?? this.height;

        // Should we reuse the same render target or create a new one ?
        let target;
        if (opts.target) {
            target = opts.target;
        } else {
            // select the best data type and format according to
            // currently drawn images and constraints
            const { type, format } = this.selectPixelTypeAndTextureFormat();

            if (!this.reuseTexture) {
                // We create a new render target for this render
                target = this.createRenderTarget(type, format, width, height);
            } else {
                // We reuse the same render target across all renders, but if the format changes,
                // we still have to recreate a new texture.
                if (this.renderTarget === undefined
                    || type !== this.renderTarget.texture.type
                    || format !== this.renderTarget.texture.format) {
                    this.renderTarget?.dispose();
                    this.renderTarget = this.createRenderTarget(
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
        this.setCameraRect(rect);

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

        target.texture.wrapS = ClampToEdgeWrapping;
        target.texture.wrapT = ClampToEdgeWrapping;
        target.texture.generateMipmaps = false;

        this.restoreState(previousState);

        return target.texture;
    }

    private _removeTextures() {
        this.ownedTextures.forEach(t => t.dispose());
        this.ownedTextures.length = 0;
    }

    /**
     * Disposes all unmanaged resources in this composer.
     */
    dispose() {
        this._removeTextures();
        this.removeObjects();
        if (this.renderTarget) {
            this.renderTarget.dispose();
        }
    }
}

export default WebGLComposer;
