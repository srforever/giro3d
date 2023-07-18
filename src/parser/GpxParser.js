/**
 * Generated On: 2016-07-07
 * Class: GpxParser
 * Description: Parse Gpx file to get [lat, lon, alt]
 */

import {
    Mesh,
    Color,
    Vector2,
    BoxGeometry,
    MeshBasicMaterial,
    Vector3,
    Group,
    Object3D,
    BufferGeometry,
} from 'three';
import Line from 'three.meshline';
import Coordinates from '../core/geographic/Coordinates';
import Capabilities from '../core/system/Capabilities.js';
import shaderUtils from '../renderer/shader/ShaderUtils.js';

const tmpVec2 = new Vector2();

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

const geometryPoint = new BoxGeometry(1, 1, 80);
const materialPoint = new MeshBasicMaterial({ color: 0xffffff });
const positionCamera = new Vector3();

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
        const points = new Group();

        gpxXML.center = gpxXML.center || _gpxPtToCartesian(wayPts[0], crs);

        const lookAt = gpxXML.center.clone().negate();

        for (const wayPt of wayPts) {
            const position = _gpxPtToCartesian(wayPt, crs).sub(gpxXML.center);
            // use Pin to make it more visible
            const mesh = new Mesh(geometryPoint, materialPoint);
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
    const masterObject = new Object3D();

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
                const geometry = new BufferGeometry().setFromPoints(points);
                const line = new Line.MeshLine();
                line.setGeometry(geometry);
                // Due to limitations in the ANGLE layer,
                // with the WebGL renderer on Windows platforms
                // lineWidth will always be 1 regardless of the set value
                // Use MeshLine to fix it
                const material = new Line.MeshLineMaterial({
                    lineWidth: options.lineWidth || 12,
                    sizeAttenuation: 0,
                    color: new Color(0xFF0000),
                });

                if (Capabilities.isLogDepthBufferSupported()) {
                    material.fragmentShader = material.fragmentShader.replace(/.*/, '').substr(1);
                    shaderUtils.patchMaterialForLogDepthSupport(material);
                    console.warn(
                        'MeshLineMaterial shader has been patched to add log depth buffer support',
                    );
                }

                const pathMesh = new Mesh(line.geometry, material);
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

    const gpxMesh = new Object3D();

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

    /**
     * Parse gpx file and convert to Mesh
     *
     * @param {string} xml the gpx file or xml.
     * @param {object} options additional properties.
     * @param {string} options.crs the default CRS of Three.js coordinates. Should be a cartesian
     * CRS.
     * @param {boolean} [options.enablePin=true] draw pin for way points.
     * @param {object} options.networkOptions options for fetching resources over network.
     * @param {number} [options.lineWidth=12] set line width to track line.
     * @returns {Mesh} a promise that resolves with a Three.js Mesh (see
     * {@link https://threejs.org/docs/#api/objects/Mesh}).
     * @example
     * // How to add a gpx object
     * GpxParser.parse(file, { crs: instance.referenceCrs }).then((gpx) => {
     *      if (gpx) {
     *         instance.scene.add(gpx);
     *         instance.notifyChange();
     *      }
     * });
     */
    parse(xml, options = {}) {
        if (!(xml instanceof XMLDocument)) {
            xml = new window.DOMParser().parseFromString(xml, 'text/xml');
        }
        return Promise.resolve(_gpxToMesh(xml, options));
    },
};
