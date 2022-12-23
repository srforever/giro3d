/**
 * @module gui/outliner/OutlinerPropertyView
 */
import { Object3D } from 'three';
import Panel from '../Panel.js';

class OutlinerPropertyView extends Panel {
    constructor(parentGui, instance) {
        super(parentGui, instance, 'Properties');

        this._folders = [];

        this.gui.domElement.style.overflow = 'auto';
        this.gui.domElement.style.maxHeight = '200px';
        this.gui.open(true);

        this.populateProperties(new Object3D());
    }

    createControllers(obj, gui) {
        if (!obj) {
            return;
        }
        Object.keys(obj).forEach(prop => {
            const value = obj[prop];
            if (value && !(value instanceof Object)) {
                this._controllers.push(
                    gui.add(obj, prop)
                        .onChange(() => this.instance.notifyChange()),
                );
            }
        });
    }

    populateProperties(obj) {
        while (this._controllers.length > 0) {
            this._controllers.pop().destroy();
        }
        while (this._folders.length > 0) {
            this._folders.pop().destroy();
        }
        this.createControllers(obj, this.gui);

        const position = this.gui.addFolder('Position');
        position.close();
        this._folders.push(position);
        this._controllers.push(position.add(obj.position, 'x').onChange(() => this.updateObject(obj)));
        this._controllers.push(position.add(obj.position, 'y').onChange(() => this.updateObject(obj)));
        this._controllers.push(position.add(obj.position, 'z').onChange(() => this.updateObject(obj)));

        const scale = this.gui.addFolder('Scale');
        scale.close();
        this._folders.push(scale);
        this._controllers.push(scale.add(obj.scale, 'x').onChange(() => this.updateObject(obj)));
        this._controllers.push(scale.add(obj.scale, 'y').onChange(() => this.updateObject(obj)));
        this._controllers.push(scale.add(obj.scale, 'z').onChange(() => this.updateObject(obj)));

        if (obj.material) {
            const material = this.gui.addFolder('Material');
            this._folders.push(material);
            material.close();
            this.createControllers(obj.material, material);
        }

        if (obj.geometry) {
            const geometry = this.gui.addFolder('Geometry');
            this._folders.push(geometry);
            geometry.close();
            this.createControllers(obj.geometry, geometry);
            if (obj.geometry.attributes) {
                const attributes = geometry.addFolder('Attributes');
                Object.keys(obj.geometry.attributes).forEach(p => {
                    const attrValue = obj.geometry.attributes[p];
                    if (p && attrValue) {
                        const attr = attributes.addFolder(p);
                        attr.close();
                        attr.add(attrValue, 'normalized');
                        attr.add(attrValue, 'count');
                        attr.add(attrValue, 'itemSize');
                        attr.add(attrValue, 'usage');
                    }
                });
            }
        }
    }
}

export default OutlinerPropertyView;
