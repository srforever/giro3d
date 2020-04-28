import { Vector2 } from 'three';

class OrthoCameraControls {
    constructor(view) {
        this.view = view;
        this.dragStartPosition = null;
        this.dragCameraStart = null;
    }

    onMouseWheel(event) {
        const change = 1 - (Math.sign(event.wheelDelta || -event.detail) * 0.1);

        const halfNewWidth = (this.view.camera.camera3D.right - this.view.camera.camera3D.left)
            * change
            * 0.5;
        const halfNewHeight = (this.view.camera.camera3D.top - this.view.camera.camera3D.bottom)
            * change
            * 0.5;
        const cx = (this.view.camera.camera3D.right + this.view.camera.camera3D.left) * 0.5;
        const cy = (this.view.camera.camera3D.top + this.view.camera.camera3D.bottom) * 0.5;

        this.view.camera.camera3D.left = cx - halfNewWidth;
        this.view.camera.camera3D.right = cx + halfNewWidth;
        this.view.camera.camera3D.top = cy + halfNewHeight;
        this.view.camera.camera3D.bottom = cy - halfNewHeight;

        this.view.notifyChange(true);
    }

    onMouseDown(event) {
        this.dragStartPosition = new Vector2(event.offsetX, event.offsetY);
        this.dragCameraStart = {
            left: this.view.camera.camera3D.left,
            right: this.view.camera.camera3D.right,
            top: this.view.camera.camera3D.top,
            bottom: this.view.camera.camera3D.bottom,
        };
    }

    onMouseMove(event) {
        if (this.dragStartPosition) {
            const windowSize = this.view.mainLoop.gfxEngine.getWindowSize();
            const width = this.view.camera.camera3D.right - this.view.camera.camera3D.left;
            const deltaX = width * (event.offsetX - this.dragStartPosition.x) / -windowSize.x;
            const deltaY = width * (event.offsetY - this.dragStartPosition.y) / windowSize.y;

            this.view.camera.camera3D.left = this.dragCameraStart.left + deltaX;
            this.view.camera.camera3D.right = this.dragCameraStart.right + deltaX;
            this.view.camera.camera3D.top = this.dragCameraStart.top + deltaY;
            this.view.camera.camera3D.bottom = this.dragCameraStart.bottom + deltaY;
            this.view.notifyChange(true);
            return true;
        }
        return false;
    }

    onMouseUp() {
        this.dragStartPosition = undefined;
    }
}

export default OrthoCameraControls;
