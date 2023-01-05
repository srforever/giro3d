import {
    Box3,
    Vector3,
} from 'three';
import Fetcher from './Fetcher.js';
import PotreeBinParser from '../parser/PotreeBinParser.js';
import PotreeCinParser from '../parser/PotreeCinParser.js';
import Picking from '../core/Picking.js';
import Extent from '../core/geographic/Extent.js';
import Points from '../core/Points.js';

// Create an A(xis)A(ligned)B(ounding)B(ox) for the child `childIndex` of one aabb.
// (PotreeConverter protocol builds implicit octree hierarchy by applying the same
// subdivision algo recursively)
function createChildAABB(aabb, childIndex) {
    // Code taken from potree
    let { min } = aabb;
    let { max } = aabb;
    const dHalfLength = new Vector3().copy(max).sub(min).multiplyScalar(0.5);
    const xHalfLength = new Vector3(dHalfLength.x, 0, 0);
    const yHalfLength = new Vector3(0, dHalfLength.y, 0);
    const zHalfLength = new Vector3(0, 0, dHalfLength.z);

    const cmin = min;
    const cmax = new Vector3().add(min).add(dHalfLength);

    if (childIndex === 1) {
        min = new Vector3().copy(cmin).add(zHalfLength);
        max = new Vector3().copy(cmax).add(zHalfLength);
    } else if (childIndex === 3) {
        min = new Vector3().copy(cmin).add(zHalfLength).add(yHalfLength);
        max = new Vector3().copy(cmax).add(zHalfLength).add(yHalfLength);
    } else if (childIndex === 0) {
        min = cmin;
        max = cmax;
    } else if (childIndex === 2) {
        min = new Vector3().copy(cmin).add(yHalfLength);
        max = new Vector3().copy(cmax).add(yHalfLength);
    } else if (childIndex === 5) {
        min = new Vector3().copy(cmin).add(zHalfLength).add(xHalfLength);
        max = new Vector3().copy(cmax).add(zHalfLength).add(xHalfLength);
    } else if (childIndex === 7) {
        min = new Vector3().copy(cmin).add(dHalfLength);
        max = new Vector3().copy(cmax).add(dHalfLength);
    } else if (childIndex === 4) {
        min = new Vector3().copy(cmin).add(xHalfLength);
        max = new Vector3().copy(cmax).add(xHalfLength);
    } else if (childIndex === 6) {
        min = new Vector3().copy(cmin).add(xHalfLength).add(yHalfLength);
        max = new Vector3().copy(cmax).add(xHalfLength).add(yHalfLength);
    }

    return new Box3(min, max);
}

function parseOctree(entity, hierarchyStepSize, root) {
    return Fetcher.arrayBuffer(`${root.baseurl}/r${root.name}.hrc`, entity.networkOptions).then(blob => {
        const dataView = new DataView(blob);

        const stack = [];

        let offset = 0;

        root.childrenBitField = dataView.getUint8(0); offset += 1;
        root.numPoints = dataView.getUint32(1, true); offset += 4;
        root.children = [];

        stack.push(root);

        while (stack.length && offset < blob.byteLength) {
            const snode = stack.shift();
            // look up 8 children
            for (let i = 0; i < 8; i++) {
                // does snode have a #i child ?
                if (snode.childrenBitField & (1 << i) && (offset + 5) <= blob.byteLength) {
                    const c = dataView.getUint8(offset); offset += 1;
                    let n = dataView.getUint32(offset, true); offset += 4;
                    if (n === 0) {
                        n = root.numPoints;
                    }
                    const childname = snode.name + i;
                    const bounds = createChildAABB(snode.bbox, i);

                    let url = root.baseurl;
                    if ((childname.length % hierarchyStepSize) === 0) {
                        const myname = childname.substr(root.name.length);
                        url = `${root.baseurl}/${myname}`;
                    }
                    const item = {
                        numPoints: n,
                        childrenBitField: c,
                        children: [],
                        name: childname,
                        baseurl: url,
                        bbox: bounds,
                        layer: entity,
                        parent: snode,
                    };
                    snode.children.push(item);
                    stack.push(item);
                }
            }
        }

        return root;
    });
}

function findChildrenByName(node, name) {
    if (node.name === name) {
        return node;
    }
    const charIndex = node.name.length;
    for (let i = 0; i < node.children.length; i++) {
        if (node.children[i].name[charIndex] === name[charIndex]) {
            return findChildrenByName(node.children[i], name);
        }
    }
    throw new Error(`Cannot find node with name '${name}'`);
}

function computeBbox(entity) {
    let bbox;
    if (entity.isFromPotreeConverter) {
        const entityBbox = entity.metadata.boundingBox;
        bbox = new Box3(
            new Vector3(entityBbox.lx, entityBbox.ly, entityBbox.lz),
            new Vector3(entityBbox.ux, entityBbox.uy, entityBbox.uz),
        );
    } else {
        // lopocs
        let idx = 0;
        for (const entry of entity.metadata) {
            if (entry.table === entity.table) {
                break;
            }
            idx++;
        }
        const entityBbox = entity.metadata[idx].bbox;
        bbox = new Box3(
            new Vector3(entityBbox.xmin, entityBbox.ymin, entityBbox.zmin),
            new Vector3(entityBbox.xmax, entityBbox.ymax, entityBbox.zmax),
        );
    }
    return bbox;
}

function parseMetadata(metadata, entity) {
    entity.metadata = metadata;

    let customBinFormat = true;

    // Lopocs pointcloud server can expose the same file structure as PotreeConverter output.
    // The only difference is the metadata root file (cloud.js vs infos/sources), and we can
    // check for the existence of a `scale` field.
    // (if `scale` is defined => we're fetching files from PotreeConverter)
    if (entity.metadata.scale !== undefined) {
        entity.isFromPotreeConverter = true;
        // PotreeConverter format
        customBinFormat = entity.metadata.pointAttributes === 'CIN';
        // do we have normal information
        const normal = Array.isArray(entity.metadata.pointAttributes)
            && entity.metadata.pointAttributes.find(elem => elem.startsWith('NORMAL'));
        if (normal) {
            entity.material.defines[normal] = 1;
        }
    } else {
        // Lopocs
        entity.metadata.scale = 1;
        entity.metadata.octreeDir = `giro3d/${entity.table}.points`;
        entity.metadata.hierarchyStepSize = 1000000; // ignore this with lopocs
        customBinFormat = true;
    }

    entity.parse = customBinFormat ? PotreeCinParser.parse : PotreeBinParser.parse;
    entity.extension = customBinFormat ? 'cin' : 'bin';
    entity.supportsProgressiveDisplay = customBinFormat;
}

export default {
    preprocessDataLayer(entity, instance) {
        const source = entity.source;
        return Fetcher.json(`${source.url}/${source.filename}`, source.networkOptions)
            .then(metadata => {
                parseMetadata(metadata, entity);
                const bbox = computeBbox(entity);
                return parseOctree(
                    entity,
                    entity.metadata.hierarchyStepSize,
                    { baseurl: `${source.url}/${entity.metadata.octreeDir}/r`, name: '', bbox },
                );
            })
            .then(root => {
                entity.root = root;
                root.findChildrenByName = findChildrenByName.bind(root, root);
                entity.extent = Extent.fromBox3(instance.referenceCrs, root.bbox);

                return entity;
            });
    },

    executeCommand(command) {
        const { layer } = command;
        const metadata = command.requester;

        // Query HRC if we don't have children metadata yet.
        if (metadata.childrenBitField && metadata.children.length === 0) {
            parseOctree(layer, layer.metadata.hierarchyStepSize, metadata)
                .then(() => command.instance.notifyChange(layer, false));
        }

        // `isLeaf` is for lopocs and allows the pointcloud server to consider that the current
        // node is the last one, even if we could subdivide even further.
        // It's necessary because lopocs doens't know about the hierarchy (it generates it on the
        // fly when we request .hrc files)
        const url = `${metadata.baseurl}/r${metadata.name}.${layer.extension}?isleaf=${command.isLeaf ? 1 : 0}`;

        return Fetcher.arrayBuffer(url, layer.source.networkOptions)
            .then(buffer => layer.parse(buffer, layer.metadata.pointAttributes)).then(geometry => {
                const points = new Points(layer, geometry, layer.material.clone());
                points.name = `r${metadata.name}.${layer.extension}`;
                if (points.material.enablePicking) {
                    Picking.preparePointGeometryForPicking(points.geometry);
                }
                points.frustumCulled = false;
                points.matrixAutoUpdate = false;
                points.position.copy(metadata.bbox.min);
                points.scale.set(layer.metadata.scale, layer.metadata.scale, layer.metadata.scale);
                points.updateMatrix();
                points.tightbbox = geometry.boundingBox.applyMatrix4(points.matrix);
                points.layers.set(layer.threejsLayer);
                points.layer = layer;
                points.extent = Extent.fromBox3(command.instance.referenceCrs, metadata.bbox);
                points.userData.metadata = metadata;
                return points;
            })
            .catch(e => {
                console.error(e);
            });
    },
};

export const _testing = {
    parseMetadata,
};
