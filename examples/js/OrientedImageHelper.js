/* global giro3d */

// set object position to the coordinate
// set object ENH orientation: X to the east, Y (green) to the north, Z (blue) look to the sky.
function placeObjectFromCoordinate(object, coord) {
    // set object position to the coordinate
    coord.toVector3(object.position);
    // set ENH orientation, looking at the sky (Z axis), so Y axis look to the north..
    object.lookAt(coord.geodesicNormal.clone().add(object.position));
}

function createTexturedPlane(textureUrl, opacity) {
    const texture = new giro3d.THREE.TextureLoader().load(textureUrl);
    const geometry = new giro3d.THREE.PlaneGeometry(1, 1, 32);
    const material = new giro3d.THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity,
    });
    return new giro3d.THREE.Mesh(geometry, material);
}

function transformTexturedPlane(camera, distance, plane) {
    const Yreel = 2 * Math.tan(giro3d.THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
    const Xreel = camera.aspect * Yreel;

    // set position and scale
    plane.scale.set(Xreel, Yreel, 1);
    plane.position.set(0, 0, -distance);

    plane.updateMatrixWorld();
}

// eslint-disable-next-line no-unused-vars
function initCamera(instance, image, coord, EnhToOrientationUp, EnhToOrientationLookAt, rotMatrix,
    orientationToCameraUp, orientationToCameraLookAt, distance, size, focale) {
    const fov = giro3d.THREE.MathUtils.radToDeg((2 * Math.atan((size[1] / 2) / focale)));

    const coordInstance = coord.as(instance.referenceCrs);

    // create 'local space', with the origin placed on 'coord',
    // with Y axis to the north, X axis to the east and Z axis as the geodesic normal.
    const localSpace = new giro3d.THREE.Object3D();
    instance.scene.add(localSpace);
    placeObjectFromCoordinate(localSpace, coordInstance);

    // add second object : 'oriented image'
    const orientedImage = new giro3d.THREE.Object3D();
    // place the 'oriented image' in the 'local space'
    localSpace.add(orientedImage);

    // setup initial convention orientation.
    orientedImage.up.copy(EnhToOrientationUp);
    orientedImage.lookAt(EnhToOrientationLookAt);

    // apply rotation
    const quaternion = new giro3d.THREE.Quaternion().setFromRotationMatrix(rotMatrix);
    orientedImage.quaternion.multiply(quaternion);
    orientedImage.updateMatrixWorld();

    // create a THREE JS Camera
    const camera = new giro3d.THREE.PerspectiveCamera(fov,
        size[0] / size[1],
        distance / 2,
        distance * 2);
    orientedImage.add(camera);
    camera.up.copy(orientationToCameraUp);
    camera.lookAt(orientationToCameraLookAt);

    localSpace.updateMatrixWorld(true);
    return camera;
}

// eslint-disable-next-line no-unused-vars
function setupPictureFromCamera(camera, imageUrl, opacity, distance) {
    // create a textured plane, representing the picture.
    const plane = createTexturedPlane(imageUrl, opacity);
    camera.add(plane);

    transformTexturedPlane(camera, distance, plane);

    return plane;
}

// set camera settings to instance.camera,
// BUT keep the geodesic normal as Up vector
// eslint-disable-next-line no-unused-vars
function setupCameraLookingAtObject(camera, coord, objectToLookAt) {
    camera.position.copy(coord.toVector3());
    camera.up.copy(coord.geodesicNormal);
    camera.lookAt(objectToLookAt.getWorldPosition());
}

// set camera settings to instance.camera, even the up vector !
// eslint-disable-next-line no-unused-vars
function setupCameraDecomposing(instance, camera) {
    let upWorld;
    const camera3D = instance.camera.camera3D;
    camera.matrixWorld.decompose(camera3D.position, camera3D.quaternion, camera3D.scale);

    // setup up vector
    upWorld = camera.localToWorld(camera.up.clone());
    upWorld = camera.position.clone().sub(upWorld);
    camera.up.copy(upWorld);
}

// add a camera helper to debug camera position..
// eslint-disable-next-line no-unused-vars
function addCameraHelper(instance, camera) {
    const cameraHelper = new giro3d.THREE.CameraHelper(camera);
    instance.scene.add(cameraHelper);
    cameraHelper.updateMatrixWorld(true);
}

// eslint-disable-next-line no-unused-vars
function setupPictureUI(menu, pictureInfos, plane, updateDistanceCallback, instance, min, max) {
    const orientedImageGUI = menu.gui.addFolder('Oriented Image');
    orientedImageGUI.add(pictureInfos, 'distance', min, max).name('Distance').onChange(value => {
        pictureInfos.distance = value;
        updateDistanceCallback();
        instance.notifyChange();
    });
    orientedImageGUI.add(pictureInfos, 'opacity', 0, 1).name('Opacity').onChange(value => {
        plane.material.opacity = value;
        instance.notifyChange();
    });
}
