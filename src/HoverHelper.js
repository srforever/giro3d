import * as THREE from 'three';

const raycaster = new THREE.Raycaster();

function eventToMouse(view, event) {
    return {
        x: (event.offsetX / view.mainLoop.gfxEngine.renderer.domElement.clientWidth) * 2 - 1,
        y: -(event.offsetY / view.mainLoop.gfxEngine.renderer.domElement.clientHeight) * 2 + 1,
    };
}

function objectUnderMouseEvent(event, view, objects) {
    const mouse = eventToMouse(view, event);

    raycaster.setFromCamera(mouse, view.camera.camera3D);
    const intersects = raycaster.intersectObjects(objects);

    if (intersects.length > 0) {
        return intersects[0].object;
    }
}


class HoverHelper {
    constructor(view) {
        this.view = view;
    }

    declareHoverableObjects(objects) {
        this.hoverableObjects = objects;
    }

    get() {
        if (this.hoveredObject) {
            return this.hoveredObject;
        }
    }

    clear() {
        if (this.hoveredObject) {
            this.hoveredObject.onMouseOver(true);
            this.hoveredObject = undefined;
            this.view.notifyChange(true);
        }
    }

    onMouseMove(event) {
        if (!this.hoverableObjects || this.hoverableObjects.length === 0) {
            return;
        }

        this.clear();

        const old = this.hoveredObject;
        this.hoveredObject = objectUnderMouseEvent(event, this.view, this.hoverableObjects);

        if (old == this.hoveredObject) {
            return;
        }
        if (old) {
            old.onMouseOver(true);
        }
        if (this.hoveredObject) {
            this.hoveredObject.onMouseOver();
            this.view.notifyChange(true);
        }
    }
}

export default HoverHelper;
