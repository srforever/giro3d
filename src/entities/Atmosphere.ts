/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */

import type { ColorRepresentation, IUniform, Material, Side } from 'three';
import {
    AdditiveBlending,
    BackSide,
    Color,
    FrontSide,
    Group,
    Mesh,
    ShaderMaterial,
    Sphere,
    SphereGeometry,
    Texture,
    Uniform,
    Vector2,
    Vector3,
} from 'three';
import Entity3D from './Entity3D';
import GlowVS from '../renderer/shader/GlowVS.glsl';
import GlowFS from '../renderer/shader/GlowFS.glsl';
import GroundVS from '../renderer/shader/GroundVS.glsl';
import GroundFS from '../renderer/shader/GroundFS.glsl';
import SkyFS from '../renderer/shader/SkyFS.glsl';
import SkyVS from '../renderer/shader/SkyVS.glsl';
import Sky from '../renderer/shader/SkyShader';
import type Context from '../core/Context';
import Ellipsoid from '../core/geographic/Ellipsoid';
import type { PickResult } from '../core/picking';

const tmpVec2 = new Vector2();
const sphere = new SphereGeometry(1, 64, 64);

class GlowMaterial extends ShaderMaterial {
    uniforms: {
        opacity: IUniform<number>;
        atmoIN: IUniform<boolean>;
        screenSize: IUniform<Vector2>;
        glowColor: IUniform<Color>;
    };

    constructor(options: {
        side: Side;
        atmoIn: boolean;
        depthWrite: boolean;
        glowColor?: ColorRepresentation;
    }) {
        super({
            vertexShader: GlowVS,
            fragmentShader: GlowFS,
            blending: AdditiveBlending,
            transparent: true,
            side: options.side,
            depthWrite: options.depthWrite,
        });

        this.uniforms.atmoIN = new Uniform(options.atmoIn);
        this.uniforms.screenSize = new Uniform(new Vector2(1, 1));
        const color = options.glowColor ? new Color(options.glowColor) : new Color(0.45, 0.74, 1.0);
        this.uniforms.glowColor = new Uniform(color);
        this.uniforms.opacity = new Uniform(1);
    }

    set screenSize(v: Vector2) {
        this.uniforms.screenSize.value.copy(v);
    }
}

export default class Atmosphere extends Entity3D {
    readonly isAtmosphere = true as const;
    readonly type = 'Atmosphere' as const;

    private readonly _sunDirection = new Vector3(1, 0, 0);

    private readonly _sphere = new Sphere(new Vector3(0, 0, 0), Ellipsoid.WGS84.semiMajorAxis);

    private readonly _outerGlow: Mesh<SphereGeometry, GlowMaterial>;
    private readonly _innerGlow: Mesh<SphereGeometry, GlowMaterial>;

    private _ground: Mesh<SphereGeometry, ShaderMaterial>;
    private _sky: Mesh<SphereGeometry, ShaderMaterial>;
    private _skyDome: Sky;

    private _realistic = false;

    get realistic() {
        return this._realistic;
    }

    set realistic(v: boolean) {
        if (v && !this._sky) {
            this.initRealisticLighning();
        }
        this._realistic = v;
        this._innerGlow.visible = !this.realistic;
        this._outerGlow.visible = !this.realistic;

        if (this._sky) {
            this._ground.visible = this.realistic;
            this._sky.visible = this.realistic;
            this._skyDome.mesh.visible = this.realistic;
        }
    }

    constructor(id: string, options?: { glowColor?: ColorRepresentation }) {
        super(id, new Group());

        this._innerGlow = this.createGlow(1.14, BackSide, false, true, options?.glowColor);
        this._innerGlow.name = 'inner glow';

        this._outerGlow = this.createGlow(1.002, FrontSide, true, false, options?.glowColor);
        this._outerGlow.name = 'outer glow';
    }

    override updateOpacity(): void {
        this.traverseMaterials((m: Material & { uniforms: { opacity: IUniform<number> } }) => {
            if (m.uniforms.opacity != null) {
                m.uniforms.opacity.value = this.opacity;
            }
        });
    }

    private createGlow(
        scale: number,
        side: Side,
        atmoIn: boolean,
        depthWrite: boolean,
        glowColor: ColorRepresentation,
    ): Mesh<SphereGeometry, GlowMaterial> {
        const result = new Mesh(
            sphere,
            new GlowMaterial({
                side,
                atmoIn,
                depthWrite,
                glowColor,
            }),
        );
        result.scale.set(
            scale * Ellipsoid.WGS84.semiMajorAxis,
            scale * Ellipsoid.WGS84.semiMajorAxis,
            scale * Ellipsoid.WGS84.semiMinorAxis,
        );
        this.object3d.add(result);
        result.updateMatrixWorld(true);

        return result;
    }

    private updateMinMaxDistance(context: Context) {
        const distance = context.distance.plane.distanceToPoint(this._sphere.center);
        const radius = this._sphere.radius;
        this._distance.min = Math.min(this._distance.min, distance - radius);
        this._distance.max = Math.max(this._distance.max, distance + radius);
    }

    postUpdate(context: Context, _changeSources: Set<unknown>): void {
        context.instance.engine.getWindowSize(tmpVec2);

        this._outerGlow.material.screenSize = tmpVec2;
        this._innerGlow.material.screenSize = tmpVec2;

        this.updateMinMaxDistance(context);
    }

    pick(): PickResult[] {
        return [];
    }

    /**
     * Sets the direction of the sun rays.
     */
    setSunDirection(direction: Vector3) {
        this._sunDirection.copy(direction);
        this._sunDirection.negate();

        if (this._sky) {
            this._sky.material.uniforms.v3LightPosition.value.copy(this._sunDirection);
            this._ground.material.uniforms.v3LightPosition.value.copy(this._sunDirection);
            this._skyDome.uniforms.sunPosition.value.copy(direction);
            this._instance.notifyChange(this);
        }
    }

    private initRealisticLighning() {
        const atmosphere = {
            Kr: 0.0025,
            Km: 0.001,
            ESun: 20.0,
            g: -0.95,
            innerRadius: 6400000,
            outerRadius: 6700000,
            wavelength: [0.65, 0.57, 0.475],
            scaleDepth: 0.25,
            mieScaleDepth: 0.1,
        };

        const uniformsSky: Record<string, IUniform> = {
            opacity: new Uniform(1),
            v3LightPosition: new Uniform(this._sunDirection.clone().normalize()),
            v3InvWavelength: new Uniform(
                new Vector3(
                    1 / Math.pow(atmosphere.wavelength[0], 4),
                    1 / Math.pow(atmosphere.wavelength[1], 4),
                    1 / Math.pow(atmosphere.wavelength[2], 4),
                ),
            ),
            fCameraHeight: new Uniform(0),
            fCameraHeight2: new Uniform(0),
            fInnerRadius: new Uniform(atmosphere.innerRadius),
            fInnerRadius2: new Uniform(atmosphere.innerRadius * atmosphere.innerRadius),
            fOuterRadius: new Uniform(atmosphere.outerRadius),
            fOuterRadius2: new Uniform(atmosphere.outerRadius * atmosphere.outerRadius),
            fKrESun: new Uniform(atmosphere.Kr * atmosphere.ESun),
            fKmESun: new Uniform(atmosphere.Km * atmosphere.ESun),
            fKr4PI: new Uniform(atmosphere.Kr * 4.0 * Math.PI),
            fKm4PI: new Uniform(atmosphere.Km * 4.0 * Math.PI),
            fScale: new Uniform(1 / (atmosphere.outerRadius - atmosphere.innerRadius)),
            fScaleDepth: new Uniform(atmosphere.scaleDepth),
            fScaleOverScaleDepth: {
                value:
                    1 / (atmosphere.outerRadius - atmosphere.innerRadius) / atmosphere.scaleDepth,
            },
            g: new Uniform(atmosphere.g),
            g2: new Uniform(atmosphere.g * atmosphere.g),
            nSamples: new Uniform(3),
            fSamples: new Uniform(3.0),
            tDisplacement: new Uniform(new Texture()),
            tSkyboxDiffuse: new Uniform(new Texture()),
            fNightScale: new Uniform(1.0),
        };

        const groundGeometry = new SphereGeometry(atmosphere.innerRadius, 50, 50);
        const groundMaterial = new ShaderMaterial({
            uniforms: uniformsSky,
            vertexShader: GroundVS,
            fragmentShader: GroundFS,
            blending: AdditiveBlending,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        this._ground = new Mesh(groundGeometry, groundMaterial);
        this._ground.name = 'ground';
        this._ground.visible = false;

        const skyGeometry = new SphereGeometry(atmosphere.outerRadius, 196, 196);
        const skyMaterial = new ShaderMaterial({
            uniforms: uniformsSky,
            vertexShader: SkyVS,
            fragmentShader: SkyFS,
            transparent: true,
            side: BackSide,
        });
        this._sky = new Mesh(skyGeometry, skyMaterial);
        this._sky.name = 'sky';
        this._sky.visible = false;

        this._skyDome = new Sky();
        this._skyDome.mesh.frustumCulled = false;
        this._skyDome.mesh.name = 'sky dome';
        this._skyDome.mesh.material.transparent = true;
        this._skyDome.mesh.visible = false;
        this._skyDome.mesh.material.depthWrite = false;

        this.object3d.add(this._ground);
        this.object3d.add(this._sky);
        this.object3d.add(this._skyDome.mesh);

        const effectController = {
            turbidity: 10,
            reileigh: 2,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.8,
            luminance: 1,
            inclination: 0.49, // elevation / inclination
            azimuth: 0.25, // Facing front,
            sun: false,
        };

        const uniforms = this._skyDome.uniforms;
        uniforms.turbidity.value = effectController.turbidity;
        uniforms.reileigh.value = effectController.reileigh;
        uniforms.luminance.value = effectController.luminance;
        uniforms.mieCoefficient.value = effectController.mieCoefficient;
        uniforms.mieDirectionalG.value = effectController.mieDirectionalG;
        uniforms.up.value = new Vector3(); // no more necessary, estimate normal from cam..
    }
}
