import type GUI from 'lil-gui';
import type { Atmosphere } from '../entities';
import type { Instance } from '../core';
import EntityInspector from './EntityInspector';

export default class AtmosphereInspector extends EntityInspector<Atmosphere> {
    sunLongitude = 0;
    sunLatitude = 0;

    constructor(parentGui: GUI, instance: Instance, atmosphere: Atmosphere) {
        super(parentGui, instance, atmosphere, {
            title: 'Atmosphere',
            boundingBoxColor: false,
            boundingBoxes: false,
            opacity: true,
            visibility: true,
        });

        this.addController<boolean>(this.entity, 'realistic')
            .name('Use realistic model')
            .onChange(() => this.notify());
    }
}
