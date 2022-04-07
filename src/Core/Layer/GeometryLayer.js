import { Color, EventDispatcher } from 'three';

import { defineLayerProperty } from './Layer.js';
import Picking from '../Picking.js';
import AtlasBuilder from '../../Renderer/AtlasBuilder.js';
import Capabilities from '../System/Capabilities.js';

export default class GeometryLayer extends EventDispatcher {
    constructor(id, object3d) {
        super();
        if (!id) {
            throw new Error('Missing id parameter (GeometryLayer must have a unique id defined)');
        }
        if (!object3d || !object3d.isObject3D) {
            throw new Error('Missing/Invalid object3d parameter (must be a three.js Object3D instance)');
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

        Object.defineProperty(this, 'id', {
            value: id,
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

        // Setup default picking method
        this.pickObjectsAt = (view, mouse, radius) => Picking.pickObjectsAt(
            view, mouse, radius, this.object3d,
        );

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

        this.postUpdate = () => {};

        // processing can overwrite that with values calculating from this layer's Object3D
        this._distance = { min: Infinity, max: 0 };
    }

    attach(layer) {
        console.log('going to attach layer', layer, this);
        if (!layer.update) {
            throw new Error(`Missing 'update' function -> can't attach layer ${layer.id}`);
        }
        this._attachedLayers.push(layer);

        if (layer.type === 'color') {
            const colorLayers = this._attachedLayers.filter(l => l.type === 'color');

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

    detach(layer) {
        const count = this._attachedLayers.length;
        this._attachedLayers = this._attachedLayers.filter(attached => attached.id !== layer.id);
        return this._attachedLayers.length < count;
    }

    /**
     * Get all the layers attached to this object.
     * @param {function(Layer):boolean} filter Optional filter function for attached layers
     * @return {Array<Layer>}
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
