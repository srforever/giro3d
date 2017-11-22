import * as THREE from 'three';

const raycaster = new THREE.Raycaster();

function eventToMouse(event) {
    return {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: -(event.clientY / window.innerHeight) * 2 + 1,
    };
}

function getDragSource(view, event, draggables) {
    if (!draggables) {
        return;
    }
    const mouse = eventToMouse(event);
    raycaster.setFromCamera(mouse, view.camera.camera3D);

    const intersects = raycaster.intersectObjects(draggables);
    if (intersects.length) {
        return intersects[0].object;
    }
}

function updateHighlight(view, selectionCircle, position3d) {
    selectionCircle.position.copy(position3d);
    selectionCircle.position.applyMatrix4(view.camera._viewMatrix);
    selectionCircle.position.x += 1;
    selectionCircle.position.y += 1;
    selectionCircle.position.multiply(
        view.mainLoop.gfxEngine.getWindowSize());
    selectionCircle.position.multiplyScalar(0.5);
    selectionCircle.position.z = 0;
    selectionCircle.updateMatrixWorld(true);
    selectionCircle.visible = true;
    view.notifyChange(true);
}

class PointDnD {
    constructor(view) {
        this.view = view;

        this.selectionCircle = new THREE.Mesh(new THREE.CircleGeometry(10, 32));
        this.selectionCircle.position.set(600, 600, 0);
        this.selectionCircle.frustumCulled = false;
        this.selectionCircle.material.opacity = 0.5;
        this.selectionCircle.material.color.set(0xffffff);
        this.selectionCircle.material.transparent = true;
        this.selectionCircle.visible = false;
        this.view.scene2D.add(this.selectionCircle);
    }

    declareDragSources(draggables) {
        this.draggables = draggables;
    }

    get() {
        return this.dragging;
    }

    hovered() {
        return this._hovered;
    }

    onMouseDown(event) {
        this.dragging = getDragSource(this.view, event, this.draggables);
        if (this.dragging && !this.dragging.onDrag) {
            this.dragging = undefined;
        }

        return !!this.dragging;
    }

    onMouseMove(event) {
        if (!this.draggables) {
            return;
        }

        if (this.dragging) {
            this._hovered = null;
            const mouse = eventToMouse(event);
            raycaster.setFromCamera(mouse, this.view.camera.camera3D);
            const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
            const p = plane.intersectLine(
                new THREE.Line3(
                    raycaster.ray.origin,
                    raycaster.ray.origin.clone()
                        .add(raycaster.ray.direction.multiplyScalar(10000000))));
            this.dragging.onDrag(p);
            updateHighlight(this.view, this.selectionCircle, p);
            this.view.notifyChange(true);
            return true;
        } else {
            this._hovered = getDragSource(this.view, event, this.draggables);
            if (this._hovered) {
                // move selection circle
                updateHighlight(this.view, this.selectionCircle, this._hovered.position);
            } else if (this.selectionCircle.visible) {
                this.selectionCircle.visible = false;
                this.view.notifyChange(true);
            }
        }
    }

    onMouseUp() {
        if (this.dragging) {
            this.dragging.onDrag(undefined, true);
        }
        this.dragging = undefined;
    }
}

export default PointDnD;
