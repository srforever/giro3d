/**
 * Generated On: 2015-10-5
 * Class: TileMesh
 * Description: Tuile de maillage, noeud du quadtree MNT. Le Materiel est issus du QuadTree ORTHO.
 */

import { Mesh } from 'three';
import RendererConstant from '../Renderer/RendererConstant.js';
import OGCWebServiceHelper from '../Provider/OGCWebServiceHelper.js';

function applyChangeState(n, s) {
    if (n.changeState) {
        n.changeState(s);
    }
}

class TileMesh extends Mesh {
    constructor(layer, geometry, material, extent, level) {
        super(geometry, material);

        this.layer = layer;

        this.matrixAutoUpdate = false;
        this.rotationAutoUpdate = false;

        this.level = level;
        this.extent = extent;

        this.geometry = geometry;

        this.obb = this.geometry.OBB.clone();

        this.frustumCulled = false;

        // Layer
        this.setDisplayed(false);

        this.layerUpdateState = {};

        this.material.setUuid(this.id);
        const dim = extent.dimensions();
        this.material.uniforms.tileDimensions.value.set(dim.x, dim.y);

        if (layer.minMaxFromElevationLayer) {
            this.setBBoxZ(layer.minMaxFromElevationLayer.min, layer.minMaxFromElevationLayer.max);
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

    setTextureElevation(layer, elevation) {
        if (this.material === null) {
            return;
        }
        this.setBBoxZ(elevation.min, elevation.max);
        this.material.setLayerTextures(layer, elevation);
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
        if (layer.protocol === 'tms' || layer.protocol === 'xyz') {
            return OGCWebServiceHelper
                .computeTMSCoordinates(this.extent, layer.extent, layer.origin)[0];
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
}
export default TileMesh;
