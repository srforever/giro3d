import type GUI from 'lil-gui';
import type Instance from '../core/Instance';
import Panel from './Panel';
import type GlobeControls from '../controls/GlobeControls';
import type { Controller } from 'lil-gui';

const altitudeFormatter = new Intl.NumberFormat(undefined, {
    style: 'unit',
    unit: 'meter',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
});

class PackageInfoInspector extends Panel {
    controls: GlobeControls;

    altitudeIncrement = '';
    private readonly _dampingControllers: Controller[] = [];

    /**
     * @param parentGui - The parent GUI.
     * @param instance - The Giro3D instance.
     */
    constructor(parentGui: GUI, instance: Instance, controls: GlobeControls) {
        super(parentGui, instance, 'Globe controls');

        this.controls = controls;

        const notify = this.notify.bind(this);

        this.addController<boolean>(this.controls, 'enabled').name('Enabled');

        this.addController<boolean>(this.controls, 'showHelpers').name('Helpers');

        this.addController<number>(this.controls, 'zoomSpeed')
            .name('Zoom speed')
            .min(0.1)
            .max(4)
            .onChange(notify);

        this.addController<boolean>(this.controls, 'enableDamping')
            .name('Damping')
            .onChange(() => {
                this.updateControllerVisibility();
            });

        this._dampingControllers.push(
            this.addController<number>(this.controls, 'dampingFactor')
                .name('Damping factor')
                .min(0.001)
                .max(1)
                .onChange(notify),
        );

        this._dampingControllers.push(
            // @ts-expect-error private property
            this.addController<number>(this.controls._orbit.sphericalDelta, 'theta').name(
                '𝚫 theta',
            ),
        );
        this._dampingControllers.push(
            // @ts-expect-error private property
            this.addController<number>(this.controls._orbit.sphericalDelta, 'phi').name('𝚫 phi'),
        );

        this.addController<number>(this, 'altitudeIncrement').name('Altitude increment');

        this.updateControllerVisibility();
    }

    updateValues(): void {
        this.altitudeIncrement = altitudeFormatter.format(this.controls.getAltitudeDelta());
    }

    private updateControllerVisibility() {
        this._dampingControllers.forEach(c => c.show(this.controls.enableDamping));
    }
}

export default PackageInfoInspector;
