import {
    EventDispatcher,
    type WebGLRenderer,
    WebGLRenderTarget,
    type RenderTargetOptions,
} from 'three';

export interface RenderTargetPoolEvents {
    cleanup: {
        /** nothing */
    };
}

/**
 * A pool that manages {@link RenderTarget}s.
 */
export default class RenderTargetPool extends EventDispatcher<RenderTargetPoolEvents> {
    // Note that we cannot share render targets between instances are they are tied to a single WebGLRenderer.
    private readonly _perRendererPools: Map<
        WebGLRenderer,
        Map<RenderTargetOptions, WebGLRenderTarget[]>
    > = new Map();
    private readonly _renderTargets: Map<WebGLRenderTarget, RenderTargetOptions> = new Map();
    private readonly _cleanupTimeoutMs: number;
    private _timeout: NodeJS.Timeout;

    constructor(cleanupTimeoutMs: number) {
        super();
        this._cleanupTimeoutMs = cleanupTimeoutMs;
    }

    acquire(renderer: WebGLRenderer, width: number, height: number, options: RenderTargetOptions) {
        if (!this._perRendererPools.has(renderer)) {
            this._perRendererPools.set(renderer, new Map());
        }

        const rendererPool = this._perRendererPools.get(renderer);
        if (!rendererPool.has(options)) {
            rendererPool.set(options, []);
        }

        const pool = rendererPool.get(options);

        if (pool.length > 0) {
            const cached = pool.pop();
            cached.setSize(width, height);
            return cached;
        }

        const result = new WebGLRenderTarget(width, height, options);
        this._renderTargets.set(result, options);
        return result;
    }

    get count(): number {
        return this._renderTargets.size;
    }

    release(obj: WebGLRenderTarget, renderer: WebGLRenderer) {
        const options = this._renderTargets.get(obj);
        if (options) {
            const instancePool = this._perRendererPools.get(renderer);
            if (instancePool) {
                if (!instancePool.has(options)) {
                    instancePool.set(options, []);
                }
                const pool = instancePool.get(options);
                pool.push(obj);
            }
        }

        if (this._timeout) {
            clearTimeout(this._timeout);
        }
        this._timeout = setTimeout(() => this.cleanup(), this._cleanupTimeoutMs);
    }

    cleanup() {
        this._timeout = null;

        this._perRendererPools.forEach(instancePool => {
            instancePool.forEach(list => {
                list.forEach(renderTarget => {
                    renderTarget.dispose();
                    this._renderTargets.delete(renderTarget);
                });
            });
        });
        this._perRendererPools.clear();

        this.dispatchEvent({ type: 'cleanup' });
    }
}

export const GlobalRenderTargetPool = new RenderTargetPool(5000);
