import Earcut from 'earcut';
import * as THREE from 'three';

const POINTS_BUDGET = 1000;

// DrawTools state
let resolve;
let instance;
let drawCount;
let positions;
let positionBuffer;
let polygonGroup;
let meshGeom;
let lineGeom;
let lineIndices;

// move event: we just update the last position
// It forces us to retriangulate the polygon, because it can switch from
// concave to convex for instance
function moveHandler(evt) {
    const picked = instance.pickObjectsAt(evt);
    if (picked.length < 1) {
        return;
    }
    // update the last positions
    positions[(drawCount - 1) * 3 + 0] = picked[0].point.x;
    positions[(drawCount - 1) * 3 + 1] = picked[0].point.y;
    positions[(drawCount - 1) * 3 + 2] = picked[0].point.z;
    positionBuffer.needsUpdate = true;

    if (drawCount >= 3) {
        meshGeom.setDrawRange(0, 3 * drawCount);
        const indices = Earcut(positions.slice(0, 3 * drawCount), [], 3);
        meshGeom.setIndex(indices);
    }

    instance.notifyChange();
}

/* On click, we create a new point and draw an additional line segment
 */
function clickHandler(evt) {
    const picked = instance.pickObjectsAt(evt);
    // did we click on something
    if (picked.length < 1) {
        return;
    }
    // set indices
    drawCount++;
    // set the new positions
    positions[(drawCount - 1) * 3 + 0] = picked[0].point.x;
    positions[(drawCount - 1) * 3 + 1] = picked[0].point.y;
    positions[(drawCount - 1) * 3 + 2] = picked[0].point.z;

    // update drawRange
    lineGeom.setDrawRange(0, 2 * (drawCount - 1));

    lineIndices.array[2 * (drawCount - 2) + 0] = drawCount - 2;
    lineIndices.array[2 * (drawCount - 2) + 1] = drawCount - 1;
    lineIndices.needsUpdate = true;

    if (drawCount > POINTS_BUDGET) {
        // I don't expect this to ever happen but if it does, we'd better know
        throw new Error(`Budget of ${POINTS_BUDGET} points exceeded in object of interest creation`);
    }
    positionBuffer.needsUpdate = true;
    instance.notifyChange();
}

/*
 * Right click closes the polygon. So we need to draw the last segment of the
 * line, and we resolve the 2D polygon.
 */
function rightClickHandler(e) {
    e.preventDefault();
    // have we picked up enough point?
    if (drawCount < 3) {
        return;
    }
    lineIndices.array[2 * (drawCount - 1) + 0] = drawCount - 1;
    lineIndices.array[2 * (drawCount - 1) + 1] = drawCount - 0;
    lineGeom.setDrawRange(0, 2 * drawCount);
    if (drawCount > POINTS_BUDGET) {
        // I don't expect this to ever happen but if it does, we'd better know
        throw new Error(`Budget of ${POINTS_BUDGET} points exceeded in object of interest creation`);
    }
    positionBuffer.needsUpdate = true;
    instance.notifyChange();

    // convert to geojson
    const coordinates = [];
    // we skip z values
    for (let i = 0; i < drawCount; i++) {
        coordinates.push([positions[3 * i], positions[3 * i + 1]]);
    }
    // at the end, we close the polygon
    coordinates.push([coordinates[0][0], coordinates[0][1]]);
    const geojson = {
        'type': 'Polygon',
        'coordinates': [coordinates],
    };

    resolve(geojson);
    cleanListeners();
}

function cleanListeners() {
    // remove listener
    if (instance) {
        instance.mainLoop.gfxEngine.renderer.domElement.removeEventListener('click', clickHandler);
        instance.mainLoop.gfxEngine.renderer.domElement.removeEventListener('mousemove', moveHandler);
        instance.mainLoop.gfxEngine.renderer.domElement.removeEventListener('contextmenu', rightClickHandler);
    }
}

function start(theInstance) {
    return new Promise((resolveFn) => {
        resolve = resolveFn;

        instance = theInstance;
        drawCount = 1;
        // let's allocate a budget of points
        // they will serve for every geometry
        positions = new Float32Array(POINTS_BUDGET * 3);
        positionBuffer = new THREE.BufferAttribute(positions, 3);

        // create group + add to instance
        // FIXME jittering on the polygone: put a real position that makes sense
        polygonGroup = new THREE.Group();

        // line geom
        lineIndices = new THREE.BufferAttribute(new Uint16Array(2 * POINTS_BUDGET), 1);
        lineGeom = new THREE.BufferGeometry();
        lineGeom.setAttribute('position', positionBuffer);
        lineGeom.setIndex(lineIndices);

        // mesh geom
        // const meshIndices = new THREE.BufferAttribute(new Uint16Array(998 * 3), 1);
        meshGeom = new THREE.BufferGeometry();
        meshGeom.setAttribute('position', positionBuffer);
        meshGeom.setIndex([]);

        // lines
        const lineMaterial = new THREE.LineBasicMaterial({
            depthTest: false,
            transparent: true,
        });
        const lines = new THREE.Line(lineGeom, lineMaterial);
        lines.renderOrder = 1;
        lines.name = 'new_object_of_interest_line';

        // mesh
        const meshMaterial = new THREE.MeshBasicMaterial({
            color: 0x347330,
            depthTest: false,
            transparent: false,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(meshGeom, meshMaterial);
        mesh.renderOrder = 1;
        mesh.name = 'new_object_of_interest_mesh';
        // add to the scene
        polygonGroup.add(lines);
        polygonGroup.add(mesh);
        instance.scene.add(polygonGroup);

        instance.mainLoop.gfxEngine.renderer.domElement.addEventListener('click', clickHandler);
        instance.mainLoop.gfxEngine.renderer.domElement.addEventListener('mousemove', moveHandler);

        instance.mainLoop.gfxEngine.renderer.domElement.addEventListener('contextmenu', rightClickHandler);
    });
}

function removeDrawings() {
    // cleaning stuff
    if (instance && polygonGroup) {
        instance.scene.remove(polygonGroup);
        polygonGroup.traverse((o) => {
            if (o.material) {
                o.material.dispose();
            }
        });
        instance.notifyChange(polygonGroup);
        polygonGroup = null;
    }
}

function reset() {
    cleanListeners();
    removeDrawings();
    instance = null;
    positions = null;
    positionBuffer = null;
    meshGeom = null;
    lineGeom = null;
    lineIndices = null;
}

const DrawTool = {
    start,
    // do we need a resume?
    stop: cleanListeners,
    reset,
};

export default DrawTool;
