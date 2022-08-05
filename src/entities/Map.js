/**
 * @module entities/Map
 */
import {
    Vector3,
    BufferGeometry,
    Group,
} from 'three';

import Coordinates from '../Core/Geographic/Coordinates.js';
import Extent from '../Core/Geographic/Extent.js';
import Layer from '../Core/layer/Layer.js';
import ColorLayer from '../Core/layer/ColorLayer.js';
import ElevationLayer from '../Core/layer/ElevationLayer.js';
import Entity3D from './Entity3D.js';
import PlanarTileBuilder from '../Core/Prefab/Planar/PlanarTileBuilder.js';
import ObjectRemovalHelper from '../Process/ObjectRemovalHelper.js';
import Picking from '../Core/Picking.js';
import ScreenSpaceError from '../Core/ScreenSpaceError.js';
import LayeredMaterial from '../Renderer/LayeredMaterial.js';
import TileMesh from '../Core/TileMesh.js';
import TileGeometry from '../Core/TileGeometry.js';
import Cache from '../Core/Scheduler/Cache.js';

function findCellWith(x, y, layerDimension, tileCount) {
    const tx = (tileCount * x) / layerDimension.x;
    const ty = (tileCount * y) / layerDimension.y;
    // if the user configures an extent with exact same dimension as the "reference" extent of the
    // crs, they won't expect this function to return the tile immediately to the bottom right.
    // therefore, if tx or ty is exactly one, we need to give back 0 instead.  we consider inclusive
    // bounds actually.
    return { x: tx === 1 ? 0 : Math.floor(tx), y: ty === 1 ? 0 : Math.floor(ty) };
}

// return the 3857 tile that fully contains the given extent
function compute3857Extent(tileExtent) {
    const extent = new Extent('EPSG:3857',
        -20037508.342789244, 20037508.342789244,
        -20037508.342789244, 20037508.342789244);
    const layerDimension = extent.dimensions();

    // Each level has 2^n * 2^n tiles...
    // ... so we count how many tiles of the same width as tile we can fit in the layer
    const tileCount = Math.min(
        Math.floor(layerDimension.x / tileExtent.dimensions().x),
        Math.floor(layerDimension.y / tileExtent.dimensions().y),
    );
    // ... 2^zoom = tilecount => zoom = log2(tilecount)
    const zoom = Math.floor(Math.max(0, Math.log2(tileCount)));

    const tl = new Coordinates('EPSG:3857', tileExtent.west(), tileExtent.north());
    const br = new Coordinates('EPSG:3857', tileExtent.east(), tileExtent.south());
    const realTileCount = 2 ** zoom;

    // compute tile that contains the center
    const topLeft = findCellWith(
        tl.x() - extent.west(), extent.north() - tl.y(),
        layerDimension, realTileCount,
    );
    const bottomRight = findCellWith(
        br.x() - extent.west(), extent.north() - br.y(),
        layerDimension, realTileCount,
    );

    const tileSize = {
        x: layerDimension.x / realTileCount,
        y: layerDimension.y / realTileCount,
    };

    const extents = [];
    for (let i = topLeft.x; i <= bottomRight.x; i++) {
        for (let j = topLeft.y; j <= bottomRight.y; j++) {
            const west = extent.west() + i * tileSize.x;
            const north = extent.north() - j * tileSize.y;

            extents.push(new Extent('EPSG:3857',
                west, west + tileSize.x,
                north - tileSize.y, north));
        }
    }
    return extents;
}

function subdivideNode(context, map, node) {
    if (!node.children.some(n => n.layer === map)) {
        const extents = node.extent.quadtreeSplit();

        for (const extent of extents) {
            const child = requestNewTile(
                map, extent, node,
            );
            node.add(child);

            // inherit our parent's textures
            for (const e of context.elevationLayers) {
                e.update(context, e, child, node, true);
            }
            const nodeUniforms = node.material.uniforms;
            if (nodeUniforms.colorTexture.value.image.width > 0) {
                for (const c of context.colorLayers) {
                    c.update(context, c, child, node, true);
                }
                child.material.uniforms.colorTexture.value = nodeUniforms.colorTexture.value;
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
    const { builder } = map;
    level = (level === undefined) ? (parent.level + 1) : level;

    const { sharableExtent, quaternion, position } = builder.computeSharableExtent(extent);
    const segment = map.segments || 8;
    const key = `${builder.type}_${segment}_${level}_${sharableExtent._values.join(',')}`;

    let geometry = Cache.get(key);
    // build geometry if doesn't exist
    if (!geometry) {
        const paramsGeometry = {
            extent: sharableExtent,
            level,
            segment,
            disableSkirt: map.disableSkirt,
        };

        geometry = new TileGeometry(paramsGeometry, builder);
        Cache.set(key, geometry);

        geometry._count = 0;
        geometry.dispose = () => {
            geometry._count--;
            if (geometry._count === 0) {
                BufferGeometry.prototype.dispose.call(geometry);
                Cache.delete(key);
            }
        };
    }

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
        // get parent extent transformation
        const pTrans = builder.computeSharableExtent(parent.extent);
        // place relative to his parent
        position.sub(pTrans.position).applyQuaternion(pTrans.quaternion.invert());
        quaternion.premultiply(pTrans.quaternion);
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

    if (__DEBUG__) {
        tile.material.uniforms.showOutline = { value: map.showOutline || false };
        tile.material.wireframe = map.wireframe || false;
    }

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
     * @param {string} id The unique identifier of the Map
     * @param {object=} options Optional properties.
     * @param {Extent} options.extent geographic extent of the map
     * @param {Extent} options.maxSubdivisionLevel Maximum subdivision level of the current map
     * @param {module:three.Object3D=} options.object3d The optional 3d object to use as the root
     *  object of this map. If none provided, a new one will be created.
     * @api
     */
    constructor(id, options = {}) {
        super(id, options.object3d || new Group());

        const extent = options.extent;
        const crs = Array.isArray(extent) ? extent[0].crs() : extent.crs();

        this.validityExtent = extent;
        if (crs === 'EPSG:3857') {
            // align quadtree on EPSG:3857 full extent
            const aligned = compute3857Extent(extent);
            this.schemeTile = aligned;
        } else if (Array.isArray(extent)) {
            this.schemeTile = extent;
        } else {
            this.schemeTile = [extent];
        }
        this.extent = this.schemeTile[0].clone();
        for (let i = 1; i < this.schemeTile.length; i++) {
            this.extent.union(this.schemeTile[i]);
        }

        this.sseScale = 1.5;
        this.maxSubdivisionLevel = options.maxSubdivisionLevel || -1;

        this.disableSkirt = true;

        this.builder = new PlanarTileBuilder();
        this.protocol = 'tile';
        this.visible = true;
        this.lighting = {
            enable: false,
            position: { x: -0.5, y: 0.0, z: 1.0 },
        };

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

            layer = layer._preprocessLayer(this, this._instance);

            layer.whenReady.then(l => {
                this.attach(l);
                this._instance.notifyChange(this, false);
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
     * @param {object} layer the layer to remove
     * @api
     */
    removeLayer(layer) {
        if (layer.object3d) { // TODO layer can have object3d ?
            ObjectRemovalHelper.removeChildrenAndCleanupRecursively(layer, layer.object3d);
            this.scene.remove(layer.object3d);
        }
        const parentLayer = this.getLayers( // TODO layer can have _attachedLayers ?
            l => l._attachedLayers && l._attachedLayers.includes(layer),
        )[0];
        if (parentLayer) {
            parentLayer.detach(layer);
        }
        this._cleanLayer(layer); // TODO this method doesn't exist.
        // TODO clean also this layer's children
        this.notifyChange(parentLayer || this._instance.camera.camera3D, true);
    }

    /**
     * Gets all layers that satisfy the filter predicate
     *
     * @api
     * @param {Function} [filter] the optional filter
     * @returns {Array<object>} the layers that matched the predicate,
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
     * @returns {Array<object>} the color layers
     */
    getColorLayers() {
        return this.getLayers(l => l instanceof ColorLayer);
    }

    /**
     * Gets all elevation layers
     *
     * @api
     * @returns {Array<object>} the color layers
     */
    getElevationLayers() {
        return this.getLayers(l => l instanceof ElevationLayer);
    }

    /**
     * Cleans all layers in the map.
     *
     * @api
     */
    clean() {
        for (const layer of this.getLayers()) {
            layer.clean(this);
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
