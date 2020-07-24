/* global giro3d */

// set object position to the coordinate
// set object ENH orientation: X to the east, Y (green) to the north, Z (blue) look to the sky.
function placeObjectFromCoordinate(object, coord) {
    // set object position to the coordinate
    coord.xyz(object.position);
    // set ENH orientation, looking at the sky (Z axis), so Y axis look to the north..
    object.lookAt(coord.geodesicNormal.clone().add(object.position));
}

function createTexturedPlane(textureUrl, opacity) {
    let texture;
    let geometry;
    let material;

    texture = new giro3d.THREE.TextureLoader().load(textureUrl);
    geometry = new giro3d.THREE.PlaneGeometry(1, 1, 32);
    material = new giro3d.THREE.MeshBasicMaterial({
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
function initCamera(view, image, coord, EnhToOrientationUp, EnhToOrientationLookAt, rotMatrix,
    orientationToCameraUp, orientationToCameraLookAt, distance, size, focale) {
    const fov = giro3d.THREE.MathUtils.radToDeg((2 * Math.atan((size[1] / 2) / focale)));
    let coordView;
    let localSpace;
    let orientedImage;
    let quaternion;
    let camera;

    coordView = coord.as(view.referenceCrs);

    // create 'local space', with the origin placed on 'coord',
    // with Y axis to the north, X axis to the east and Z axis as the geodesic normal.
    localSpace = new giro3d.THREE.Object3D();
    view.scene.add(localSpace);
    placeObjectFromCoordinate(localSpace, coordView);

    // add second object : 'oriented image'
    orientedImage = new giro3d.THREE.Object3D();
    // place the 'oriented image' in the 'local space'
    localSpace.add(orientedImage);

    // setup initial convention orientation.
    orientedImage.up.copy(EnhToOrientationUp);
    orientedImage.lookAt(EnhToOrientationLookAt);

    // apply rotation
    quaternion = new giro3d.THREE.Quaternion().setFromRotationMatrix(rotMatrix);
    orientedImage.quaternion.multiply(quaternion);
    orientedImage.updateMatrixWorld();

    // create a THREE JS Camera
    camera = new giro3d.THREE.PerspectiveCamera(fov, size[0] / size[1], distance / 2, distance * 2);
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

// set camera settings to view.camera,
// BUT keep the geodesic normal as Up vector
// eslint-disable-next-line no-unused-vars
function setupViewCameraLookingAtObject(camera, coord, objectToLookAt) {
    camera.position.copy(coord.xyz());
    camera.up.copy(coord.geodesicNormal);
    camera.lookAt(objectToLookAt.getWorldPosition());
}

// set camera settings to view.camera, even the up vector !
// eslint-disable-next-line no-unused-vars
function setupViewCameraDecomposing(view, camera) {
    let upWorld;
    const viewCamera = view.camera.camera3D;
    camera.matrixWorld.decompose(viewCamera.position, viewCamera.quaternion, viewCamera.scale);

    // setup up vector
    upWorld = camera.localToWorld(camera.up.clone());
    upWorld = viewCamera.position.clone().sub(upWorld);
    viewCamera.up.copy(upWorld);
}

// add a camera helper to debug camera position..
// eslint-disable-next-line no-unused-vars
function addCameraHelper(view, camera) {
    const cameraHelper = new giro3d.THREE.CameraHelper(camera);
    view.scene.add(cameraHelper);
    cameraHelper.updateMatrixWorld(true);
}

// eslint-disable-next-line no-unused-vars
function setupPictureUI(menu, pictureInfos, plane, updateDistanceCallback, view, min, max) {
    const orientedImageGUI = menu.gui.addFolder('Oriented Image');
    orientedImageGUI.add(pictureInfos, 'distance', min, max).name('Distance').onChange(value => {
        pictureInfos.distance = value;
        updateDistanceCallback();
        view.notifyChange();
    });
    orientedImageGUI.add(pictureInfos, 'opacity', 0, 1).name('Opacity').onChange(value => {
        plane.material.opacity = value;
        view.notifyChange();
    });
}
