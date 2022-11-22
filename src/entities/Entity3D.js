/**
 * @module entities/Entity3D
 */
import { Color, Box3 } from 'three';

import { defineLayerProperty } from '../Core/layer/Layer.js';
import ColorLayer from '../Core/layer/ColorLayer.js';
import Picking from '../Core/Picking.js';
import AtlasBuilder from '../Renderer/AtlasBuilder.js';
import Capabilities from '../Core/System/Capabilities.js';
import Entity from './Entity.js';
import eventDispatcher from '../Core/eventDispatcher.js';

/**
 * An {@link module:entities/Entity~Entity entity} that display 3D objects.
 *
 * @api
 */
class Entity3D extends Entity {
    /**
     * Creates a Entity3D with the specified parameters.
     *
     * @param {string} id the unique identifier of this entity
     * @param {module:three.Object3D} object3d the root Three.js of this entity
     */
    constructor(id, object3d) {
        super(id);
        if (!object3d || !object3d.isObject3D) {
            throw new Error(
                'Missing/Invalid object3d parameter (must be a three.js Object3D instance)',
            );
        }
        this._attachedLayers = [];
        this._instance = null; // will be filled when we add the object to an instance

        if (object3d && object3d.type === 'Group' && object3d.name === '') {
            object3d.name = id;
        }

        this.type = 'geometry';

        Object.defineProperty(this, 'object3d', {
            value: object3d,
            writable: false,
        });

        // layer parameters
        // TODO there must be a better way™
        const changeOpacity = o => {
            if (o.material) {
                // != null: we want the test to pass if opacity is 0
                if (o.material.opacity != null) {
                    o.material.transparent = this.noTextureOpacity < 1.0 || this.opacity < 1.0;
                    o.material.opacity = this.opacity;
                }
                if (o.material.uniforms && o.material.uniforms.opacity != null) {
                    o.material.transparent = this.noTextureOpacity < 1.0 || this.opacity < 1.0;
                    o.material.uniforms.opacity.value = this.opacity;
                }
                o.material.depthWrite = !o.material.transparent;
            }
        };
        defineLayerProperty(this, 'opacity', 1.0, () => {
            if (this.object3d) {
                this.object3d.traverse(o => {
                    if (o.layer !== this) {
                        return;
                    }
                    changeOpacity(o);
                    // 3dtiles layers store scenes in children's content property
                    if (o.content) {
                        o.content.traverse(changeOpacity);
                    }
                });
            }
        });
        const changeNoTextureColor = o => {
            if (o.material) {
                if (o.material.noTextureColor) {
                    o.material.noTextureColor.value.copy(this.noTextureColor);
                }
                if (o.material.uniforms && o.material.uniforms.noTextureColor) {
                    o.material.uniforms.noTextureColor.value.copy(this.noTextureColor);
                }
                o.material.depthWrite = !o.material.transparent;
            }
        };
        defineLayerProperty(this, 'noTextureColor', new Color(0.04, 0.23, 0.35), () => {
            if (this.object3d) {
                this.object3d.traverse(o => {
                    if (o.layer !== this) {
                        return;
                    }
                    changeNoTextureColor(o);
                    // 3dtiles layers store scenes in children's content property
                    if (o.content) {
                        o.content.traverse(changeNoTextureColor);
                    }
                });
            }
        });
        const changeNoTextureOpacity = o => {
            if (o.material) {
                // != undefined: we want the test to pass if noTextureOpacity is 0
                if (o.material.noTextureOpacity != null) {
                    o.material.transparent = this.noTextureOpacity < 1.0 || this.opacity < 1.0;
                    o.material.noTextureOpacity = this.noTextureOpacity;
                }
                if (o.material.uniforms && o.material.uniforms.noTextureOpacity != null) {
                    o.material.transparent = this.noTextureOpacity < 1.0 || this.opacity < 1.0;
                    o.material.uniforms.noTextureOpacity.value = this.noTextureOpacity;
                }
                o.material.depthWrite = !o.material.transparent;
            }
        };
        defineLayerProperty(this, 'noTextureOpacity', 1.0, () => {
            if (this.object3d) {
                this.object3d.traverse(o => {
                    if (o.layer !== this) {
                        return;
                    }
                    changeNoTextureOpacity(o);
                    // 3dtiles layers store scenes in children's content property
                    if (o.content) {
                        o.content.traverse(changeNoTextureOpacity);
                    }
                });
            }
        });

        this.atlasInfo = { maxX: 0, maxY: 0 };

        // Attached layers expect to receive the visual representation of a layer (= THREE object
        // with a material).  So if a layer's update function don't process this kind of object, the
        // layer must provide a getObjectToUpdateForAttachedLayers function that returns the correct
        // object to update for attached layer.  See 3dtilesProvider or PointCloudProvider for
        // examples.
        this.getObjectToUpdateForAttachedLayers = obj => {
            if (!obj.parent || !obj.material) {
                return null;
            }
            return {
                element: obj,
                parent: obj.parent,
            };
        };

        // processing can overwrite that with values calculating from this layer's Object3D
        this._distance = { min: Infinity, max: 0 };
    }

    /**
     * Returns an approximated bounding box of this entity in the scene.
     *
     * @returns {Box3|null} the resulting bounding box, or `null` if it could not be computed.
     */
    getBoundingBox() {
        if (this.object3d) {
            const box = new Box3().setFromObject(this.object3d);
            return box;
        }

        return null;
    }

    /**
     * Picks objects given a position and a radius from the layer.
     *
     * @param {object} coordinates The x/y position in the layer
     * @param {object=} options Optional properties. See Instance.pickObjectsAt
     * @param {object[]} [target=undefined] Target array to fill
     * @returns {object[]} Picked objects (node)
     */
    pickObjectsAt(coordinates, options, target) {
        return Picking.pickObjectsAt(
            this._instance,
            coordinates,
            this.object3d,
            options,
            target,
        );
    }

    attach(layer) {
        if (!layer.update) {
            throw new Error(`Missing 'update' function -> can't attach layer ${layer.id}`);
        }
        layer = layer._preprocessLayer(this, this._instance);
        layer._instance = this._instance;
        if (!layer.imageSize) {
            layer.imageSize = { w: 256, h: 256 };
        }

        this._attachedLayers.push(layer);
        this.reindexLayers();

        if (layer instanceof ColorLayer) {
            const colorLayers = this._attachedLayers.filter(l => l instanceof ColorLayer);

            // rebuild color textures atlas
            const { atlas, maxX, maxY } = AtlasBuilder.pack(
                Capabilities.getMaxTextureSize(),
                colorLayers.map(l => l.id),
                colorLayers.map(l => l.imageSize),
                this.atlasInfo.atlas,
            );
            this.atlasInfo.atlas = atlas;
            this.atlasInfo.maxX = Math.max(this.atlasInfo.maxX, maxX);
            this.atlasInfo.maxY = Math.max(this.atlasInfo.maxY, maxY);
        }
    }

    reindexLayers() {
        for (let i = 0; i < this._attachedLayers.length; i++) {
            const element = this._attachedLayers[i];
            element.index = i;
        }
    }

    detach(layer) {
        const count = this._attachedLayers.length;
        this._attachedLayers = this._attachedLayers.filter(attached => attached.id !== layer.id);
        return this._attachedLayers.length < count;
    }

    /**
     * Get all the layers attached to this object.
     *
     * @param {function(module:Core/Layer~Layer):boolean} filter
     * Optional filter function for attached layers
     * @returns {Array<module:Core/Layer~Layer>} the layers attached to this object
     */
    getLayers(filter) {
        const result = [];
        for (const attached of this._attachedLayers) {
            if (!filter || filter(attached)) {
                result.push(attached);
            }
        }
        return result;
    }
}

Object.assign(Entity3D.prototype, eventDispatcher);

export default Entity3D;
