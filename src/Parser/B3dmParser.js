import { Matrix4, MeshLambertMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import LegacyGLTFLoader from './LegacyGLTFLoader.js';
import BatchTableParser from './BatchTableParser.js';
import Capabilities from '../Core/System/Capabilities.js';
import shaderUtils from '../Renderer/Shader/ShaderUtils.js';
import utf8Decoder from '../utils/Utf8Decoder.js';

const matrixChangeUpVectorZtoY = (new Matrix4()).makeRotationX(Math.PI / 2);
// For gltf rotation
const matrixChangeUpVectorZtoX = (new Matrix4()).makeRotationZ(-Math.PI / 2);

const glTFLoader = new GLTFLoader();

const legacyGLTFLoader = new LegacyGLTFLoader();

function filterUnsupportedSemantics(obj) {
    // see GLTFLoader GLTFShader.prototype.update function
    const supported = [
        'MODELVIEW',
        'MODELVIEWINVERSETRANSPOSE',
        'PROJECTION',
        'JOINTMATRIX'];

    if (obj.gltfShader) {
        const names = [];
        // eslint-disable-next-line guard-for-in
        for (const name of Object.keys(obj.gltfShader.boundUniforms)) {
            names.push(name);
        }
        for (const name of names) {
            const { semantic } = obj.gltfShader.boundUniforms[name];
            if (supported.indexOf(semantic) < 0) {
                delete obj.gltfShader.boundUniforms[name];
            }
        }
    }
}
// parse for RTC values
function applyOptionalCesiumRTC(data, gltf) {
    const headerView = new DataView(data, 0, 20);
    const contentArray = new Uint8Array(data, 20, headerView.getUint32(12, true));
    const content = utf8Decoder.decode(new Uint8Array(contentArray));
    const json = JSON.parse(content);
    if (json.extensions && json.extensions.CESIUM_RTC) {
        gltf.position.fromArray(json.extensions.CESIUM_RTC.center);
        gltf.updateMatrixWorld(true);
    }
}

export default {
    /** @module B3dmParser */

    /**
     * Parse b3dm buffer and extract Scene and batch table
     *
     * @param {ArrayBuffer} buffer the b3dm buffer.
     * @param {object} options additional properties.
     * @param {string=} [options.gltfUpAxis='Y'] embedded glTF model up axis.
     * @param {string} options.urlBase the base url of the b3dm file (used to fetch textures for
     * the embedded glTF model).
     * @param {boolean=} [options.doNotPatchMaterial='false'] disable patching material with
     * logarithmic depth buffer support.
     * @param {number} [options.opacity=1.0] the b3dm opacity.
     * @param {boolean|Material} [options.overrideMaterials='false'] override b3dm's embedded
     * glTF materials. If overrideMaterials is a three.js material, it will be the material used to
     * override.
     * @returns {Promise} - a promise that resolves with an object containig
     * a Scene (gltf) and a batch table (batchTable).
     */
    parse(buffer, options) {
        const { gltfUpAxis } = options;
        const { urlBase } = options;
        if (!buffer) {
            throw new Error('No array buffer provided.');
        }

        const view = new DataView(buffer, 4); // starts after magic

        let byteOffset = 0;
        const b3dmHeader = {};

        // Magic type is unsigned char [4]
        b3dmHeader.magic = utf8Decoder.decode(new Uint8Array(buffer, 0, 4));
        if (b3dmHeader.magic) {
            // Version, byteLength, batchTableJSONByteLength, batchTableBinaryByteLength and
            // batchTable types are uint32
            b3dmHeader.version = view.getUint32(byteOffset, true);
            byteOffset += Uint32Array.BYTES_PER_ELEMENT;

            b3dmHeader.byteLength = view.getUint32(byteOffset, true);
            byteOffset += Uint32Array.BYTES_PER_ELEMENT;

            b3dmHeader.FTJSONLength = view.getUint32(byteOffset, true);
            byteOffset += Uint32Array.BYTES_PER_ELEMENT;

            b3dmHeader.FTBinaryLength = view.getUint32(byteOffset, true);
            byteOffset += Uint32Array.BYTES_PER_ELEMENT;

            b3dmHeader.BTJSONLength = view.getUint32(byteOffset, true);
            byteOffset += Uint32Array.BYTES_PER_ELEMENT;

            b3dmHeader.BTBinaryLength = view.getUint32(byteOffset, true);
            byteOffset += Uint32Array.BYTES_PER_ELEMENT;

            const promises = [];
            // Parse batch table
            if (b3dmHeader.BTJSONLength > 0) {
                // sizeBegin in the index where the batch table starts. 28
                // is the byte length of the b3dm header
                const sizeBegin = 28 + b3dmHeader.FTJSONLength + b3dmHeader.FTBinaryLength;
                promises.push(BatchTableParser.parse(
                    buffer.slice(sizeBegin, b3dmHeader.BTJSONLength + sizeBegin),
                ));
            } else {
                promises.push(Promise.resolve({}));
            }
            // TODO: missing feature table
            promises.push(new Promise(resolve => {
                const onerror = error => console.error(error);
                const onload = gltf => {
                    for (const scene of gltf.scenes) {
                        scene.traverse(filterUnsupportedSemantics);
                    }
                    // Rotation managed
                    if (gltfUpAxis === undefined || gltfUpAxis === 'Y') {
                        gltf.scene.applyMatrix4(matrixChangeUpVectorZtoY);
                    } else if (gltfUpAxis === 'X') {
                        gltf.scene.applyMatrix4(matrixChangeUpVectorZtoX);
                    }

                    // RTC managed
                    applyOptionalCesiumRTC(buffer.slice(28 + b3dmHeader.FTJSONLength
                        + b3dmHeader.FTBinaryLength + b3dmHeader.BTJSONLength
                        + b3dmHeader.BTBinaryLength), gltf.scene);

                    const initMesh = function initFn(mesh) {
                        mesh.frustumCulled = false;
                        if (!mesh.material) {
                            return;
                        }
                        if (options.overrideMaterials) {
                            mesh.material.dispose();
                            if (typeof (options.overrideMaterials) === 'object'
                                && options.overrideMaterials.isMaterial) {
                                mesh.material = options.overrideMaterials.clone();
                            } else {
                                mesh.material = new MeshLambertMaterial({ color: 0xffffff });
                            }
                        } else if (Capabilities.isLogDepthBufferSupported()
                                    && mesh.material.isRawShaderMaterial
                                    && !options.doNotPatchMaterial) {
                            shaderUtils.patchMaterialForLogDepthSupport(mesh.material);
                            console.warn(
                                'b3dm shader has been patched to add log depth buffer support',
                            );
                        }
                        mesh.material.transparent = options.opacity < 1.0;
                        mesh.material.opacity = options.opacity;
                    };
                    gltf.scene.traverse(initMesh);

                    resolve(gltf);
                };

                const gltfBuffer = buffer.slice(28 + b3dmHeader.FTJSONLength
                    + b3dmHeader.FTBinaryLength + b3dmHeader.BTJSONLength
                    + b3dmHeader.BTBinaryLength);

                const version = new DataView(gltfBuffer, 0, 20).getUint32(4, true);

                if (version === 1) {
                    legacyGLTFLoader.parse(gltfBuffer, onload, urlBase);
                } else {
                    glTFLoader.parse(gltfBuffer, urlBase, onload, onerror);
                }
            }));
            return Promise.all(promises)
                .then(values => ({ gltf: values[1], batchTable: values[0] }));
        }
        throw new Error('Invalid b3dm file.');
    },
};
