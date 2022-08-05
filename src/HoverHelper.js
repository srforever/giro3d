import { Raycaster } from 'three';

const raycaster = new Raycaster();

function eventToMouse(instance, event) {
    return {
        x: (event.offsetX / instance.mainLoop.gfxEngine.renderer.domElement.clientWidth) * 2 - 1,
        y: -(event.offsetY / instance.mainLoop.gfxEngine.renderer.domElement.clientHeight) * 2 + 1,
    };
}

function objectUnderMouseEvent(event, instance, objects) {
    const mouse = eventToMouse(instance, event);

    raycaster.setFromCamera(mouse, instance.camera.camera3D);
    const intersects = raycaster.intersectObjects(objects, false);

    if (intersects.length === 0) {
        return null;
    }
    return intersects[0].object;
}

class HoverHelper {
    constructor(instance) {
        this.instance = instance;
    }

    declareHoverableObjects(objects) {
        this.hoverableObjects = objects;
    }

    get() {
        return this.hoveredObject;
    }

    clear() {
        if (this.hoveredObject) {
            this.hoveredObject.onMouseOver(true);
            this.hoveredObject = undefined;
            this.instance.notifyChange(true);
        }
    }

    onMouseMove(event) {
        if (!this.hoverableObjects || this.hoverableObjects.length === 0) {
            return;
        }

        this.clear();

        const old = this.hoveredObject;
        this.hoveredObject = objectUnderMouseEvent(event, this.instance, this.hoverableObjects);

        if (old === this.hoveredObject) {
            return;
        }
        if (old) {
            old.onMouseOver(true);
        }
        if (this.hoveredObject) {
            this.hoveredObject.onMouseOver();
            this.instance.notifyChange(true);
        }
    }
}

export default HoverHelper;
