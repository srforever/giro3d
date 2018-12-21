/**
 * Generated On: 2015-10-5
 * Class: TileMesh
 * Description: Tuile de maillage, noeud du quadtree MNT. Le Materiel est issus du QuadTree ORTHO.
 */

import * as THREE from 'three';
import RendererConstant from '../Renderer/RendererConstant';
import OGCWebServiceHelper from '../Provider/OGCWebServiceHelper';

function TileMesh(layer, geometry, material, extent, level) {
    // Constructor
    THREE.Mesh.call(this, geometry, material);

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

    this._state = RendererConstant.FINAL;
}

TileMesh.prototype = Object.create(THREE.Mesh.prototype);
TileMesh.prototype.constructor = TileMesh;

TileMesh.prototype.updateMatrixWorld = function updateMatrixWorld(force) {
    THREE.Mesh.prototype.updateMatrixWorld.call(this, force);
    this.OBB().update();
};

TileMesh.prototype.isVisible = function isVisible() {
    return this.visible;
};

TileMesh.prototype.setDisplayed = function setDisplayed(show) {
    this.material.visible = show && this.material.update();
};

TileMesh.prototype.setVisibility = function setVisibility(show) {
    this.visible = show;
};

TileMesh.prototype.isDisplayed = function isDisplayed() {
    return this.material.visible;
};

// switch material in function of state
TileMesh.prototype.changeState = function changeState(state) {
    if (state == this._state) {
        return;
    }
    if (state == RendererConstant.DEPTH) {
        this.material.defines.DEPTH_MODE = 1;
        delete this.material.defines.MATTE_ID_MODE;
    } else if (state == RendererConstant.ID) {
        this.material.defines.MATTE_ID_MODE = 1;
        delete this.material.defines.DEPTH_MODE;
    } else {
        delete this.material.defines.MATTE_ID_MODE;
        delete this.material.defines.DEPTH_MODE;
    }

    this._state = state;

    this.material.needsUpdate = true;
};

function applyChangeState(n, s) {
    if (n.changeState) {
        n.changeState(s);
    }
}

TileMesh.prototype.pushRenderState = function pushRenderState(state) {
    if (this._state == state) {
        return () => { };
    }

    const oldState = this._state;
    this.traverse(n => applyChangeState(n, state));

    return () => {
        this.traverse(n => applyChangeState(n, oldState));
    };
};

TileMesh.prototype.setFog = function setFog(fog) {
    this.material.setFogDistance(fog);
};

TileMesh.prototype.setSelected = function setSelected(select) {
    this.material.setSelected(select);
};

TileMesh.prototype.setTextureElevation = function setTextureElevation(layer, elevation) {
    if (this.material === null) {
        return;
    }
    this.setBBoxZ(elevation.min, elevation.max);
    this.material.setLayerTextures(layer, elevation);
};


TileMesh.prototype.setBBoxZ = function setBBoxZ(min, max) {
    if (min == undefined && max == undefined) {
        return;
    }
    if (Math.floor(min) !== Math.floor(this.obb.z.min) || Math.floor(max) !== Math.floor(this.obb.z.max)) {
        this.OBB().updateZ(min, max);
    }
};

TileMesh.prototype.OBB = function OBB() {
    return this.obb;
};

TileMesh.prototype.removeColorLayer = function removeColorLayer(idLayer) {
    if (this.layerUpdateState && this.layerUpdateState[idLayer]) {
        delete this.layerUpdateState[idLayer];
    }
    this.material.removeColorLayer(idLayer);
};

TileMesh.prototype.changeSequenceLayers = function changeSequenceLayers(sequence) {
    const layerCount = this.material.getColorLayersCount();

    // Quit if there is only one layer
    if (layerCount < 2) {
        return;
    }

    this.material.setSequence(sequence);
};

TileMesh.prototype.getExtentForLayer = function getExtentForLayer(layer) {
    if (layer.extent.crs() != this.extent.crs()) {
        throw new Error('Unsupported reprojection');
    }
    if (layer.protocol == 'tms' || layer.protocol == 'xyz') {
        return OGCWebServiceHelper
            .computeTMSCoordinates(this.extent, layer.extent, layer.origin)[0];
    }
    return this.extent;
};

/**
 * Search for a common ancestor between this tile and another one. It goes
 * through parents on each side until one is found.
 *
 * @param {TileMesh} tile
 *
 * @return {TileMesh} the resulting common ancestor
 */
TileMesh.prototype.findCommonAncestor = function findCommonAncestor(tile) {
    if (!tile) {
        return undefined;
    }
    if (tile.level == this.level) {
        if (tile.id == this.id) {
            return tile;
        } else if (tile.level != 0) {
            return this.parent.findCommonAncestor(tile.parent);
        } else {
            return undefined;
        }
    } else if (tile.level < this.level) {
        return this.parent.findCommonAncestor(tile);
    } else {
        return this.findCommonAncestor(tile.parent);
    }
};

TileMesh.prototype.isAncestorOf = function isAncestorOf(node) {
    return node.findCommonAncestor(this) === this;
};

export default TileMesh;
