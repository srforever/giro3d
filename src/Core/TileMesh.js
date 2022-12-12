/**
 * Generated On: 2015-10-5
 * Class: TileMesh
 * Description: Tuile de maillage, noeud du quadtree MNT. Le Materiel est issus du QuadTree ORTHO.
 */

import { Mesh, Vector4 } from 'three';

import RendererConstant from '../Renderer/RendererConstant.js';
import MemoryTracker from '../Renderer/MemoryTracker.js';

const NO_NEIGHBOUR = -99;
const VECTOR4_ZERO = new Vector4(0, 0, 0, 0);

function applyChangeState(n, s) {
    if (n.changeState) {
        n.changeState(s);
    }
}

class TileMesh extends Mesh {
    constructor(map, geometry, material, extent, level, x = 0, y = 0) {
        super(geometry, material);

        this.layer = map;

        this.matrixAutoUpdate = false;
        this.rotationAutoUpdate = false;

        this.level = level;
        this.extent = extent;

        this.geometry = geometry;

        // Needs to clone it because the geometry is not copied anymore
        this.obb = this.geometry.OBB.clone();

        this.name = `tile @ (z=${level}, x=${x}, y=${y})`;
        this.obb.name = 'obb';

        this.frustumCulled = false;

        // Layer
        this.setDisplayed(false);

        this.layerUpdateState = {};

        this.material.setUuid(this.id);
        const dim = extent.dimensions();
        this.material.uniforms.tileDimensions.value.set(dim.x, dim.y);

        if (map.minMaxFromElevationLayer) {
            this.setBBoxZ(map.minMaxFromElevationLayer.min, map.minMaxFromElevationLayer.max);
        } else {
            // This is a flat BBOX, let's give it a minimal thickness of 1 meter.
            this.setBBoxZ(-0.5, +0.5);
        }

        this.x = x;
        this.y = y;
        this.z = level;
        map.tileIndex.addTile(this);

        if (__DEBUG__) {
            MemoryTracker.track(this, this.name);
        }
    }

    /**
     * @param {TileMesh} neighbour The neighbour.
     * @param {number} location Its location in the neighbour array.
     */
    _processNeighbour(neighbour, location) {
        const diff = neighbour.level - this.level;

        const uniform = this.material.uniforms.neighbours.value[location];
        const neighbourElevation = neighbour.material.texturesInfo.elevation;

        const offsetScale = this.extent.offsetToParent(neighbour.extent);
        const nOffsetScale = neighbourElevation.offsetScale.clone();

        nOffsetScale.x += offsetScale.x * nOffsetScale.z;
        nOffsetScale.y += offsetScale.y * nOffsetScale.w;
        nOffsetScale.z *= offsetScale.z;
        nOffsetScale.w *= offsetScale.w;

        uniform.offsetScale = nOffsetScale;
        uniform.diffLevel = diff;
        uniform.elevationTexture = neighbourElevation.texture;
    }

    /**
     * @param {Array<TileMesh>} neighbours The neighbours.
     */
    processNeighbours(neighbours) {
        for (let i = 0; i < neighbours.length; i++) {
            const neighbour = neighbours[i];
            if (neighbour && neighbour.material && neighbour.material.visible) {
                this._processNeighbour(neighbour, i);
            } else {
                const uniform = this.material.uniforms.neighbours.value[i];
                uniform.diffLevel = NO_NEIGHBOUR;
                uniform.offsetScale = VECTOR4_ZERO;
                uniform.elevationTexture = undefined;
            }
        }
    }

    updateMatrixWorld(force) {
        super.updateMatrixWorld.call(this, force);
        this.OBB().update();
    }

    isVisible() {
        return this.visible;
    }

    setDisplayed(show) {
        this.material.visible = show && this.material.update();
        this.material.transparent = this.material.opacity !== 1
            || this.material.uniforms.noTextureOpacity.value !== 1;
    }

    setVisibility(show) {
        this.visible = show;
    }

    isDisplayed() {
        return this.material.visible;
    }

    // switch material in function of state
    changeState(state) {
        if (state === this.material.uniforms.renderingState.value) {
            return;
        }
        // TODO this is a implicit dep to LayeredMaterial
        this.material.uniforms.renderingState.value = state;
        if (state > RendererConstant.FINAL) {
            this.material.transparent = false;
        } else {
            this.material.transparent = this.material.opacity !== 1
                || this.material.uniforms.noTextureOpacity.value !== 1;
        }

        this.material.needsUpdate = true;
    }

    pushRenderState(state) {
        if (this.material.uniforms.renderingState.value === state) {
            return () => { };
        }

        const oldState = this.material.uniforms.renderingState.value;
        this.traverse(n => applyChangeState(n, state));

        return () => {
            this.traverse(n => applyChangeState(n, oldState));
        };
    }

    setFog(fog) {
        this.material.setFogDistance(fog);
    }

    setSelected(select) {
        this.material.setSelected(select);
    }

    setElevationTexture(layer, elevation, isInherited = false) {
        if (this.material === null) {
            return;
        }
        this.setBBoxZ(elevation.min, elevation.max);
        this.material.setElevationTexture(layer, elevation, isInherited);
    }

    setBBoxZ(min, max) {
        // 0 is an acceptable value
        if (min == null && max == null) {
            return;
        }
        if (Math.floor(min) !== Math.floor(this.obb.z.min)
            || Math.floor(max) !== Math.floor(this.obb.z.max)) {
            this.OBB().updateZ(min, max);
        }
    }

    OBB() {
        return this.obb;
    }

    removeColorLayer(idLayer) {
        if (this.layerUpdateState && this.layerUpdateState[idLayer]) {
            delete this.layerUpdateState[idLayer];
        }
        this.material.removeColorLayer(idLayer);
    }

    changeSequenceLayers(sequence) {
        const layerCount = this.material.getColorLayersCount();

        // Quit if there is only one layer
        if (layerCount < 2) {
            return;
        }

        this.material.setSequence(sequence);
    }

    getExtentForLayer(layer) {
        if (layer.extent.crs() !== this.extent.crs()) {
            throw new Error(`Layer should be in the same CRS of their supporting tile geometry, but layer crs is ${layer.extent.crs()} and tile crs is ${this.extent.crs()}`);
        }
        return this.extent;
    }

    /**
     * Search for a common ancestor between this tile and another one. It goes
     * through parents on each side until one is found.
     *
     * @param {TileMesh} tile the tile to evaluate
     * @returns {TileMesh} the resulting common ancestor
     */
    findCommonAncestor(tile) {
        if (!tile) {
            return undefined;
        }
        if (tile.level === this.level) {
            if (tile.id === this.id) {
                return tile;
            }
            if (tile.level !== 0) {
                return this.parent.findCommonAncestor(tile.parent);
            }
            return undefined;
        }
        if (tile.level < this.level) {
            return this.parent.findCommonAncestor(tile);
        }
        return this.findCommonAncestor(tile.parent);
    }

    isAncestorOf(node) {
        return node.findCommonAncestor(this) === this;
    }

    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.material.dispose();
        this.geometry.dispose();
        this.material = null;
        this.geometry = null;
        this.dispatchEvent({ type: 'dispose' });
    }
}
export default TileMesh;
