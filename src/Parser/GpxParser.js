/**
 * Generated On: 2016-07-07
 * Class: GpxParser
 * Description: Parse Gpx file to get [lat, lon, alt]
 */

import * as THREE from 'three';
import Line from 'three.meshline';
import Coordinates from '../Core/Geographic/Coordinates.js';
import Capabilities from '../Core/System/Capabilities.js';
import shaderUtils from '../Renderer/Shader/ShaderUtils.js';

const tmpVec2 = new THREE.Vector2();

function _gpxToWayPointsArray(gpxXML) {
    return gpxXML.getElementsByTagName('wpt');
}

function _gGpxToWTrackPointsArray(gpxXML) {
    return gpxXML.getElementsByTagName('trkpt');
}

function _gGpxToWTrackSegmentsArray(gpxXML) {
    return gpxXML.getElementsByTagName('trkseg');
}

function _gpxPtToCartesian(pt, crs) {
    const longitude = Number(pt.attributes.lon.nodeValue);
    const latitude = Number(pt.attributes.lat.nodeValue);
    // TODO: get elevation with terrain
    const elem = pt.getElementsByTagName('ele')[0];
    const elevation = elem ? Number(elem.childNodes[0].nodeValue) : 0;

    return new Coordinates('EPSG:4326', longitude, latitude, elevation).as(crs).xyz();
}

const geometryPoint = new THREE.BoxGeometry(1, 1, 80);
const materialPoint = new THREE.MeshBasicMaterial({ color: 0xffffff });
const positionCamera = new THREE.Vector3();

function getDistance(object, camera) {
    const point = object.geometry.boundingSphere.center.clone().applyMatrix4(object.matrixWorld);
    positionCamera.setFromMatrixPosition(camera.matrixWorld);
    return positionCamera.distanceTo(point);
}

function updatePointScale(renderer, scene, camera) {
    const distance = getDistance(this, camera);
    const scale = Math.max(2, Math.min(100, distance / renderer.getSize(tmpVec2).height));
    this.scale.set(scale, scale, scale);
    this.updateMatrixWorld();
}

function _gpxToWayPointsMesh(gpxXML, crs) {
    const wayPts = _gpxToWayPointsArray(gpxXML);

    if (wayPts.length) {
        const points = new THREE.Group();

        gpxXML.center = gpxXML.center || _gpxPtToCartesian(wayPts[0], crs);

        const lookAt = gpxXML.center.clone().negate();

        for (const wayPt of wayPts) {
            const position = _gpxPtToCartesian(wayPt, crs).sub(gpxXML.center);
            // use Pin to make it more visible
            const mesh = new THREE.Mesh(geometryPoint, materialPoint);
            mesh.position.copy(position);
            mesh.lookAt(lookAt);

            // Scale pin in function of distance
            mesh.onBeforeRender = updatePointScale;

            points.add(mesh);
        }
        return points;
    }
    return null;
}

function updatePath(renderer, scene, camera) {
    const distance = getDistance(this, camera);
    this.material.depthTest = distance < this.geometry.boundingSphere.radius * 2;
    const size = renderer.getSize(tmpVec2);
    this.material.uniforms.resolution.value.set(size.width, size.height);
}

function _gpxToWTrackPointsMesh(gpxXML, options) {
    const trackSegs = _gGpxToWTrackSegmentsArray(gpxXML);
    const masterObject = new THREE.Object3D();

    if (trackSegs.length) {
        for (const trackSeg of trackSegs) {
            const trackPts = _gGpxToWTrackPointsArray(trackSeg);

            if (trackPts.length) {
                gpxXML.center = gpxXML.center || _gpxPtToCartesian(trackPts[0], options.crs);

                const points = [];
                for (const trackPt of trackPts) {
                    const point = _gpxPtToCartesian(trackPt, options.crs).sub(gpxXML.center);
                    points.push(point);
                }
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const line = new Line.MeshLine();
                line.setGeometry(geometry);
                // Due to limitations in the ANGLE layer,
                // with the WebGL renderer on Windows platforms
                // lineWidth will always be 1 regardless of the set value
                // Use MeshLine to fix it
                const material = new Line.MeshLineMaterial({
                    lineWidth: options.lineWidth || 12,
                    sizeAttenuation: 0,
                    color: new THREE.Color(0xFF0000),
                });

                if (Capabilities.isLogDepthBufferSupported()) {
                    material.fragmentShader = material.fragmentShader.replace(/.*/, '').substr(1);
                    shaderUtils.patchMaterialForLogDepthSupport(material);
                    console.warn(
                        'MeshLineMaterial shader has been patched to add log depth buffer support',
                    );
                }

                const pathMesh = new THREE.Mesh(line.geometry, material);
                // update size screen uniform
                // update depth test for visibilty path, because of the proximity of the terrain and
                // gpx mesh
                pathMesh.onBeforeRender = updatePath;
                masterObject.add(pathMesh);
            }
        }
        return masterObject;
    }

    return null;
}

function _gpxToMesh(gpxXML, options = {}) {
    if (!gpxXML) {
        return undefined;
    }

    // we want to test for null and undefined, false is an acceptable value
    if (options.enablePin == null) {
        options.enablePin = true;
    }

    const gpxMesh = new THREE.Object3D();

    // Getting the track points
    const trackPts = _gpxToWTrackPointsMesh(gpxXML, options);

    if (trackPts) {
        gpxMesh.add(trackPts);
    }

    if (options.enablePin) {
        // Getting the waypoint points
        const wayPts = _gpxToWayPointsMesh(gpxXML, options.crs);

        if (wayPts) {
            gpxMesh.add(wayPts);
        }
    }

    gpxMesh.position.copy(gpxXML.center);
    gpxMesh.updateMatrixWorld();
    // gpxMesh is static data, it doens't need matrix update
    gpxMesh.matrixAutoUpdate = false;

    return gpxMesh;
}

export default {
    /** @module GpxParser */
    /** Parse gpx file and convert to THREE.Mesh
     * @function parse
     * @param {string} xml - the gpx file or xml.
     * @param {Object=} options - additional properties.
     * @param {string} options.crs - the default CRS of Three.js coordinates. Should be a cartesian
     * CRS.
     * @param {boolean=} [options.enablePin=true] - draw pin for way points.
     * @param {NetworkOptions=} options.networkOptions - options for fetching resources over
     * network.
     * @param {number=} [options.lineWidth=12] - set line width to track line.
     * @return {THREE.Mesh} - a promise that resolves with a Three.js Mesh (see
     * {@link https://threejs.org/docs/#api/objects/Mesh}).
     * @example
     * // How to add a gpx object
     * giro3d.GpxParser.parse(file, { crs: viewer.referenceCrs }).then((gpx) => {
     *      if (gpx) {
     *         viewer.scene.add(gpx);
     *         viewer.notifyChange();
     *      }
     * });
     *
     */
    parse(xml, options = {}) {
        if (!(xml instanceof XMLDocument)) {
            xml = new window.DOMParser().parseFromString(xml, 'text/xml');
        }
        return Promise.resolve(_gpxToMesh(xml, options));
    },
};
