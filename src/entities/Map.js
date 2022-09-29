/**
 * @module entities/Map
 */
import {
    Vector3,
    Quaternion,
    BufferGeometry,
    Group,
    Color,
} from 'three';

import Extent from '../Core/Geographic/Extent.js';
import Layer from '../Core/layer/Layer.js';
import ColorLayer from '../Core/layer/ColorLayer.js';
import ElevationLayer from '../Core/layer/ElevationLayer.js';
import Entity3D from './Entity3D.js';
import ObjectRemovalHelper from '../Process/ObjectRemovalHelper.js';
import Picking from '../Core/Picking.js';
import ScreenSpaceError from '../Core/ScreenSpaceError.js';
import LayeredMaterial from '../Renderer/LayeredMaterial.js';
import TileMesh from '../Core/TileMesh.js';
import TileGeometry from '../Core/TileGeometry.js';
import Cache from '../Core/Scheduler/Cache.js';

/**
 * Fires when a layer is added to the map.
 *
 * @api
 * @event Map#layer-added
 * @example
 * map.addEventListener('layer-added', () => console.log('layer added!'));
 */

/**
 * Fires when a layer is added to the map.
 *
 * @api
 * @event Map#layer-removed
 * @example
 * map.addEventListener('layer-removed', () => console.log('layer removed!'));
 */

function subdivideNode(context, map, node) {
    if (!node.children.some(n => n.layer === map)) {
        const extents = node.extent.quadtreeSplit();

        for (const extent of extents) {
            const child = requestNewTile(
                map, extent, node,
            );
            node.add(child);

            // inherit our parent's textures
            for (const e of map.getElevationLayers()) {
                e.update(context, child, node, true);
            }
            const nodeUniforms = node.material.uniforms;
            if (nodeUniforms.colorTexture.value.image.width > 0) {
                for (const c of map.getColorLayers()) {
                    c.update(context, child, node, true);
                }
            }

            child.updateMatrixWorld(true);
        }
        context.instance.notifyChange(node);
    }
}

function requestNewTile(map, extent, parent, level) {
    if (parent && !parent.material) {
        return null;
    }
    level = (level === undefined) ? (parent.level + 1) : level;

    const quaternion = new Quaternion();
    const position = new Vector3(...extent.center()._values);
    // compute sharable extent to pool the geometries
    // the geometry in common extent is identical to the existing input
    // with a translation
    const dim = extent.dimensions();
    const sharableExtent = new Extent(
        extent.crs(),
        -dim.x * 0.5, dim.x * 0.5,
        -dim.y * 0.5, dim.y * 0.5,
    );
    const segment = map.segments || 8;

    let key = `${extent._values.join(',')}`;
    let geometry = Cache.get(key);
    if (!geometry) {
        key = `${sharableExtent._values.join(',')}`;
        const paramsGeometry = {
            extent: sharableExtent,
            segment,
        };
        geometry = Cache.get(key);
        if (!geometry) {
            // build geometry if doesn't exist
            geometry = new TileGeometry(paramsGeometry);
            Cache.set(key, geometry);
        } else {
            // copy from cache
            geometry = new TileGeometry(paramsGeometry, geometry);
        }
    }
    geometry._count = 0;
    geometry.dispose = () => {
        geometry._count--;
        if (geometry._count === 0) {
            BufferGeometry.prototype.dispose.call(geometry);
            Cache.delete(key);
        }
    };

    // build tile
    geometry._count++;
    const material = new LayeredMaterial(
        map.materialOptions, segment, map.atlasInfo,
    );
    const tile = new TileMesh(map, geometry, material, extent, level);
    tile.layers.set(map.threejsLayer);
    if (map.renderOrder !== undefined) {
        tile.renderOrder = map.renderOrder;
    }
    material.opacity = map.opacity;

    if (parent && parent instanceof TileMesh) {
        // get parent position from extent
        const positionParent = new Vector3(...parent.extent.center()._values);
        // place relative to his parent
        position.sub(positionParent).applyQuaternion(parent.quaternion.invert());
        quaternion.premultiply(parent.quaternion);
    }

    tile.position.copy(position);
    tile.quaternion.copy(quaternion);

    tile.material.transparent = map.opacity < 1.0;
    tile.material.uniforms.opacity.value = map.opacity;
    tile.setVisibility(false);
    tile.updateMatrix();

    if (map.noTextureColor) {
        tile.material.uniforms.noTextureColor.value.copy(map.noTextureColor);
    }

    // no texture opacity
    if (map.noTextureOpacity !== undefined) {
        tile.material.uniforms.noTextureOpacity.value = map.noTextureOpacity;
    }

    tile.material.uniforms.showOutline = { value: map.showOutline || false };
    tile.material.wireframe = map.wireframe || false;

    if (parent) {
        tile.setBBoxZ(parent.OBB().z.min, parent.OBB().z.max);
    } else {
        // TODO: probably not here
        // TODO get parentGeometry from layer
        const elevation = map.getLayers(l => l instanceof ElevationLayer);
        if (elevation.length > 0) {
            if (!elevation[0].minmax) {
                console.error('fix the provider');
            }
            tile.setBBoxZ(elevation[0].minmax.min, elevation[0].minmax.max);
        }
    }

    tile.add(tile.OBB());
    map.onTileCreated(map, parent, tile);

    return tile;
}

const tmpVector = new Vector3();

/**
 * A map is an {@link module:entities/Entity~Entity Entity} that represents a flat
 * surface displaying one or more {@link module:Core/layer/Layer~Layer Layers}.
 *
 * If an elevation layer is added, the surface of the map is deformed to
 * display terrain.
 *
 * @api
 */
class Map extends Entity3D {
    /**
     * Constructs a Map object.
     *
     * @param {string} id The unique identifier of the map.
     * @param {object=} options Constructor options.
     * @param {Extent} options.extent The geographic extent of the map.
     * @param {number} [options.maxSubdivisionLevel=-1] Maximum tile depth of the map.
     * A value of `-1` does not limit the depth of the tile hierarchy.
     * @param {boolean} [options.hillshading=false] Enables [hillshading](https://earthquake.usgs.gov/education/geologicmaps/hillshades.php).
     * Note: for hillshading to work, there must be an elevation layer in the map.
     * @param {number} [options.segments=8] The number of geometry segments in each map tile.
     * The higher the better. For better visual results, it is recommended to use a power of two.
     * @param {module:three.Object3D=} options.object3d The optional 3d object to use as the root
     *  object of this map. If none provided, a new one will be created.
     * @param {string} [options.backgroundColor=undefined] The color of the map when no color layers
     * are present.
     * @api
     */
    constructor(id, options = {}) {
        super(id, options.object3d || new Group());

        /** @type {Extent} */
        this.extent = options.extent;

        this.segments = options.segments || 8;
        this.sseScale = 1.5;
        this.maxSubdivisionLevel = options.maxSubdivisionLevel || -1;

        this.type = 'Map';
        this.protocol = 'tile';
        this.visible = true;
        this.lighting = {
            enable: false,
            position: { x: -0.5, y: 0.0, z: 1.0 },
        };
        this.materialOptions = { hillshading: options.hillshading };
        if (options.backgroundColor) {
            this.noTextureColor = new Color(options.backgroundColor);
        }

        this.currentAddedLayerIds = [];
    }

    pickObjectsAt(instance, mouse, radius) {
        return Picking.pickTilesAt(
            instance,
            mouse,
            radius,
            this,
        );
    }

    preUpdate(context, changeSources) {
        context.colorLayers = context.instance.getLayers(
            (l, a) => a && a.id === this.id && l instanceof ColorLayer,
        );
        context.elevationLayers = context.instance.getLayers(
            (l, a) => a && a.id === this.id && l instanceof ElevationLayer,
        );

        if (__DEBUG__) {
            this._latestUpdateStartingLevel = 0;
        }

        if (changeSources.has(undefined) || changeSources.size === 0) {
            return this.level0Nodes;
        }

        let commonAncestor;
        for (const source of changeSources.values()) {
            if (source.isCamera) {
                // if the change is caused by a camera move, no need to bother
                // to find common ancestor: we need to update the whole tree:
                // some invisible tiles may now be visible
                return this.level0Nodes;
            }
            if (source.layer === this.id) {
                if (!commonAncestor) {
                    commonAncestor = source;
                } else {
                    commonAncestor = source.findCommonAncestor(commonAncestor);
                    if (!commonAncestor) {
                        return this.level0Nodes;
                    }
                }
                if (commonAncestor.material == null) {
                    commonAncestor = undefined;
                }
            }
        }
        if (commonAncestor) {
            if (__DEBUG__) {
                this._latestUpdateStartingLevel = commonAncestor.level;
            }
            return [commonAncestor];
        }
        return this.level0Nodes;
    }

    update(context, node) {
        if (!node.parent) {
            return ObjectRemovalHelper.removeChildrenAndCleanup(this, node);
        }

        if (context.fastUpdateHint) {
            if (!context.fastUpdateHint.isAncestorOf(node)) {
                // if visible, children bbox can only be smaller => stop updates
                if (node.material.visible) {
                    this.updateMinMaxDistance(context, node);
                    return null;
                }
                if (node.visible) {
                    return node.children.filter(n => n.layer === this);
                }
                return null;
            }
        }

        // do proper culling
        if (!this.frozen) {
            const isVisible = context.camera.isBox3Visible(
                node.OBB().box3D, node.OBB().matrixWorld,
            );
            node.visible = isVisible;
        }

        if (node.visible) {
            let requestChildrenUpdate = false;

            if (!this.frozen) {
                const s = node.OBB().box3D.getSize(tmpVector);
                const obb = node.OBB();
                const sse = ScreenSpaceError.computeFromBox3(
                    context.camera,
                    obb.box3D,
                    obb.matrixWorld,
                    Math.max(s.x, s.y),
                    ScreenSpaceError.MODE_2D,
                );

                node.sse = sse; // DEBUG

                if (this.testTileSSE(node, sse)
                    && this.hasEnoughTexturesToSubdivide(context, node)) {
                    subdivideNode(context, this, node);
                    // display iff children aren't ready
                    node.setDisplayed(false);
                    requestChildrenUpdate = true;
                } else {
                    node.setDisplayed(true);
                }
            } else {
                requestChildrenUpdate = true;
            }

            if (node.material.visible) {
                node.material.update();

                this.updateMinMaxDistance(context, node);

                // update uniforms
                if (!requestChildrenUpdate) {
                    return ObjectRemovalHelper.removeChildren(this, node);
                }
            }

            // TODO: use Array.slice()
            return requestChildrenUpdate ? node.children.filter(n => n.layer === this) : undefined;
        }

        node.setDisplayed(false);
        return ObjectRemovalHelper.removeChildren(this, node);
    }

    postUpdate() {
        for (const r of this.level0Nodes) {
            r.traverse(node => {
                if (node.layer !== this || !node.material.visible) {
                    return;
                }
                node.material.uniforms.neighbourdiffLevel.value.set(0, 0, 0, 1);
                const n = node.findNeighbours();
                if (n) {
                    const dimensions = node.extent.dimensions();
                    const elevationNeighbours = node.material.texturesInfo.elevation.neighbours;
                    for (let i = 0; i < 4; i++) {
                        if (!n[i] || !n[i][0].material.visible) {
                            // neighbour is missing or smaller => don't do anything
                            node.material.uniforms
                                .neighbourdiffLevel.value.setComponent(i, 1);
                        } else {
                            const nn = n[i][0];
                            const targetExtent = n[i][1];

                            // We want to compute the diff level, but can't directly
                            // use nn.level - node.level, because there's no garuantee
                            // that we're on a regular grid.
                            // The only thing we can assume is their shared edge are
                            // equal with a power of 2 factor.
                            const diff = Math.log2((i % 2)
                                ? Math.round(nn.extent.dimensions().y / dimensions.y)
                                : Math.round(nn.extent.dimensions().x / dimensions.x));

                            node.material.uniforms
                                .neighbourdiffLevel.value.setComponent(i, -diff);
                            elevationNeighbours.texture[i] = nn
                                .material
                                .texturesInfo
                                .elevation
                                .texture;

                            const offscale = targetExtent.offsetToParent(nn.extent);

                            elevationNeighbours.offsetScale[i] = nn
                                .material
                                .texturesInfo
                                .elevation
                                .offsetScale
                                .clone();

                            elevationNeighbours.offsetScale[i].x
                                += offscale.x * elevationNeighbours.offsetScale[i].z;
                            elevationNeighbours.offsetScale[i].y
                                += offscale.y * elevationNeighbours.offsetScale[i].w;
                            elevationNeighbours.offsetScale[i].z *= offscale.z;
                            elevationNeighbours.offsetScale[i].w *= offscale.w;
                        }
                    }
                }
            });
        }
    }

    // TODO this whole function should be either in providers or in layers

    /**
     * Adds a layer , then returns the created layer.
     * Before use this method, add the map in an instance.
     * If the extent or the projection of the layer is not provided,
     * the values from map will be used.
     *
     * @param {module:Core/layer/Layer~Layer} layer an object describing the layer options creation
     * @returns {Promise} a promise resolving when the layer is ready
     * @api
     */
    addLayer(layer) {
        return new Promise((resolve, reject) => {
            if (!this._instance) {
                reject(new Error('map is not attached to an instance'));
                return;
            }

            if (!(layer instanceof Layer)) {
                reject(new Error('layer is not an instance of Layer'));
                return;
            }
            const duplicate = this.getLayers((l => l.id === layer.id));
            if (duplicate.length > 0 || this.currentAddedLayerIds.includes(layer.id)) {
                reject(new Error(`Invalid id '${layer.id}': id already used`));
                return;
            }
            this.currentAddedLayerIds.push(layer.id);

            if (!layer.extent) {
                layer.extent = this.extent;
            }
            if (!layer.projection) {
                layer.projection = this.projection;
            }
            layer.imageSize = this.imageSize;

            layer = layer._preprocessLayer(this, this._instance);

            layer.whenReady.then(l => {
                if (!this.currentAddedLayerIds.includes(layer.id)) {
                    // The layer was removed, stop attaching it.
                    return;
                }
                this.attach(l);
                this._instance.notifyChange(this, false);
                this.dispatchEvent({ type: 'layer-added' });
                resolve(l);
            }).catch(r => {
                reject(r);
            }).then(() => {
                this.currentAddedLayerIds = this.currentAddedLayerIds.filter(l => l !== layer.id);
            });
        });
    }

    /**
     * Removes a layer from the map.
     *
     * @param {Layer} layer the layer to remove
     * @returns {boolean} `true` if the layer was present, `false` otherwise.
     * @api
     */
    removeLayer(layer) {
        this.currentAddedLayerIds = this.currentAddedLayerIds.filter(l => l !== layer.id);
        if (this.detach(layer)) {
            layer.dispose(this);
            this.dispatchEvent({ type: 'layer-removed' });
            this._instance.notifyChange(this, true);
            return true;
        }

        return false;
    }

    /**
     * Gets all layers that satisfy the filter predicate
     *
     * @api
     * @param {Function} [filter] the optional filter
     * @returns {Array<Layer>} the layers that matched the predicate,
     * or all layers if no predicate was provided.
     */
    getLayers(filter) {
        const result = [];
        for (const layer of this._attachedLayers) {
            if (!filter || filter(layer)) {
                result.push(layer);
            }
        }
        return result;
    }

    /**
     * Gets all color layers
     *
     * @api
     * @returns {Array<Layer>} the color layers
     */
    getColorLayers() {
        return this.getLayers(l => l instanceof ColorLayer);
    }

    /**
     * Gets all elevation layers
     *
     * @api
     * @returns {Array<Layer>} the color layers
     */
    getElevationLayers() {
        return this.getLayers(l => l instanceof ElevationLayer);
    }

    /**
     * Disposes all layers in the map.
     */
    dispose() {
        for (const layer of this.getLayers()) {
            layer.dispose(this);
        }
    }

    hasEnoughTexturesToSubdivide(context, node) {
        // Prevent subdivision if node is covered by at least one elevation layer
        // and if node doesn't have a elevation texture yet.
        for (const e of context.elevationLayers) {
            if (!e.frozen && e.ready && e.tileInsideLimit(node, e)
                && !node.material.isElevationLayerTextureLoaded(e)) {
                // no stop subdivision in the case of a loading error
                if (node.layerUpdateState[e.id] && node.layerUpdateState[e.id].inError()) {
                    continue;
                }
                return false;
            }
        }

        if (node.children.some(n => n.layer === this)) {
            // No need to prevent subdivision, since we've already done it before
            return true;
        }

        // Prevent subdivision if missing color texture
        /* for (const c of context.colorLayers) {
            if (c.frozen || !c.visible || !c.ready) {
                continue;
            }
            // no stop subdivision in the case of a loading error
            if (node.layerUpdateState[c.id] && node.layerUpdateState[c.id].inError()) {
                continue;
            }
            if (c.tileInsideLimit(node, c) && !node.material.isColorLayerTextureLoaded(c)) {
                return false;
            }
            } */
        return true;
    }

    testTileSSE(tile, sse) {
        if (this.maxSubdivisionLevel > 0 && this.maxSubdivisionLevel <= tile.level) {
            return false;
        }

        if (tile.extent.dimensions().x < 5) {
            return false;
        }

        if (!sse) {
            return true;
        }

        const values = [
            sse.lengths.x * sse.ratio,
            sse.lengths.y * sse.ratio,
        ];

        // TODO: depends on texture size of course
        // if (values.filter(v => v < 200).length >= 2) {
        //     return false;
        // }
        if (values.filter(v => v < (100 * tile.layer.sseScale)).length >= 1) {
            return false;
        }
        return values.filter(v => v >= (384 * tile.layer.sseScale)).length >= 2;
    }

    updateMinMaxDistance(context, node) {
        const bbox = node.OBB().box3D.clone()
            .applyMatrix4(node.OBB().matrixWorld);
        const distance = context.distance.plane
            .distanceToPoint(bbox.getCenter(tmpVector));
        const radius = bbox.getSize(tmpVector).length() * 0.5;
        this._distance.min = Math.min(this._distance.min, distance - radius);
        this._distance.max = Math.max(this._distance.max, distance + radius);
    }
}

export { Map, requestNewTile };
