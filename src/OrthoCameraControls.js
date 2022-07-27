import { Vector2 } from 'three';

class OrthoCameraControls {
    constructor(instance) {
        this.instance = instance;
        this.dragStartPosition = null;
        this.dragCameraStart = null;
    }

    onMouseWheel(event) {
        const change = 1 - (Math.sign(event.wheelDelta || -event.detail) * 0.1);
        const camera3d = this.instance.camera.camera3D;

        const halfNewWidth = (camera3d.right - camera3d.left)
            * change
            * 0.5;
        const halfNewHeight = (camera3d.top - camera3d.bottom)
            * change
            * 0.5;
        const cx = (camera3d.right + camera3d.left) * 0.5;
        const cy = (camera3d.top + camera3d.bottom) * 0.5;

        camera3d.left = cx - halfNewWidth;
        camera3d.right = cx + halfNewWidth;
        camera3d.top = cy + halfNewHeight;
        camera3d.bottom = cy - halfNewHeight;

        this.instance.notifyChange(camera3d, true);
    }

    onMouseDown(event) {
        const camera3d = this.instance.camera.camera3D;
        this.dragStartPosition = new Vector2(event.offsetX, event.offsetY);
        this.dragCameraStart = {
            left: camera3d.left,
            right: camera3d.right,
            top: camera3d.top,
            bottom: camera3d.bottom,
        };
    }

    onMouseMove(event) {
        if (this.dragStartPosition) {
            const camera3d = this.instance.camera.camera3D;
            const windowSize = this.instance.mainLoop.gfxEngine.getWindowSize();
            const width = camera3d.right - camera3d.left;
            const deltaX = (width * (event.offsetX - this.dragStartPosition.x)) / -windowSize.x;
            const deltaY = (width * (event.offsetY - this.dragStartPosition.y)) / windowSize.y;

            camera3d.left = this.dragCameraStart.left + deltaX;
            camera3d.right = this.dragCameraStart.right + deltaX;
            camera3d.top = this.dragCameraStart.top + deltaY;
            camera3d.bottom = this.dragCameraStart.bottom + deltaY;
            this.instance.notifyChange(camera3d, true);
            return true;
        }
        return false;
    }

    onMouseUp() {
        this.dragStartPosition = undefined;
    }
}

export default OrthoCameraControls;
