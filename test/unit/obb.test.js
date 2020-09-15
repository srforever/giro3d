/* global describe, it */
import * as THREE from 'three';
import proj4 from 'proj4';
import assert from 'assert';
import Extent from '../../src/Core/Geographic/Extent.js';
import PlanarTileBuilder from '../../src/Core/Prefab/Planar/PlanarTileBuilder.js';
import TileGeometry from '../../src/Core/TileGeometry.js';
import OBB from '../../src/Renderer/ThreeExtended/OBB.js';

const max = new THREE.Vector3(10, 10, 10);
const min = new THREE.Vector3(-10, -10, -10);
const lookAt = new THREE.Vector3(1, 0, 0);
const translate = new THREE.Vector3(0, 0, 20);
const obb = new OBB(min, max);
obb.lookAt(lookAt);
obb.translateX(translate.x);
obb.translateY(translate.y);
obb.translateZ(translate.z);
obb.update();

describe('OBB', () => {
    it('should correctly instance obb', () => {
        assert.equal(obb.natBox.min.x, min.x);
        assert.equal(obb.natBox.max.x, max.x);
    });
});


// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
proj4.defs('EPSG:3946', '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
function assertVerticesAreInOBB(builder, extent) {
    const params = {
        extent,
        disableSkirt: true,
    };

    const geom = new TileGeometry(params, builder);
    const inverse = new THREE.Matrix4().getInverse(geom.OBB.matrix);

    let failing = 0;
    const vec = new THREE.Vector3();
    for (let i = 0; i < geom.attributes.position.count; i++) {
        vec.fromArray(geom.attributes.position.array, 3 * i);

        vec.applyMatrix4(inverse);
        if (!geom.OBB.box3D.containsPoint(vec)) {
            failing++;
        }
    }
    assert.equal(geom.attributes.position.count - failing, geom.attributes.position.count, 'All points should be inside OBB');
}

describe('Planar tiles OBB computation', () => {
    const builder = new PlanarTileBuilder();

    it('should compute OBB correctly', () => {
        const extent = new Extent('EPSG:3946', -100, 100, -50, 50);
        assertVerticesAreInOBB(builder, extent);
    });
});
