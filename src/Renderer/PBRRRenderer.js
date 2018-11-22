import * as THREE from 'three';
import BasicVS from './Shader/BasicVS.glsl';
import PBRRPassOneVS from './Shader/PBRRPassOneVS.glsl';
import PBRRPassOneFS from './Shader/PBRRPassOneFS.glsl';
import PBRRPassTwoFS from './Shader/PBRRPassTwoFS.glsl';
import EDLPassOneFS from './Shader/EDLPassOneFS.glsl';
import EDLPassTwoFS from './Shader/EDLPassTwoFS.glsl';

const RT = {
    COLOR_AND_DEPTH: 0,
    PASS_TWO_PING: 1,
    PASS_TWO_PONG: 2,
};

function PBRRRenderer(view) {
    this.edlScene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), null);
    const rays = new Float32Array(3 * 4);
    const attr = new THREE.BufferAttribute(rays, 3);
    attr.setDynamic(true);
    this.quad.geometry.addAttribute('ray', attr);

    this.quad.frustumCulled = false;
    this.edlScene.add(this.quad);
    this.edlCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);

    this.passOne = new THREE.ShaderMaterial({
        uniforms: {
            depthTexture: { value: null },
            colorTexture: { value: null },
            m43: { value: 0 },
            m33: { value: 0 },
            near: { value: 0 },
            far: { value: 0 },
            rightTop: { value: new THREE.Vector2(256, 256) },
            resolution: { value: new THREE.Vector2(256, 256) },
            invPersMatrix: { value: new THREE.Matrix4() },
            threshold: { value: 0 },
            showRemoved: { value: true },
        },
        vertexShader: PBRRPassOneVS,
        fragmentShader: PBRRPassOneFS,
    });
    this.passOne.extensions.fragDepth = true;

    this.passTwo = new THREE.ShaderMaterial({
        uniforms: {
            depthTexture: { value: null },
            colorTexture: { value: null },
            resolution: { value: new THREE.Vector2(256, 256) },
            depth_contrib: { value: 0.5 },
        },
        vertexShader: BasicVS,
        fragmentShader: PBRRPassTwoFS,
    });
    this.passTwo.extensions.fragDepth = true;

    this.renderTargets = [null, null, null];

    this._createRenderTargets(view);

    view.addEventListener('resize', () => {
        this.renderTargets.forEach(rt => rt.dispose());
        this._createRenderTargets(view);
    });

    this.controlParameters = {
        visibility: true,
        fill_steps: 2,
        threshold: 0.9,
        showRemoved: true,
        depth_contrib: 0.5,
    };

    this.edlMaterial = new THREE.ShaderMaterial({
        uniforms: {
            depthTexture: { value: null },
            depthTextureHalfRes: { value: null },
            depthTextureQuarterRes: { value: null },
            subsample: { value: false },
            resolution: { value: new THREE.Vector2(256, 256) },
            cameraNear: { value: 0.01 },
            cameraFar: { value: 100 },
            radius: { value: 3 },
            strength: { value: 0.35 },
            directions: { value: 8 },
            n: { value: 1 },

        },
        vertexShader: BasicVS,
        fragmentShader: EDLPassOneFS,
    });

    this.composeMaterial = new THREE.ShaderMaterial({
        uniforms: {
            textureColor: { value: null },
            textureEDL: { value: null },
        },
        vertexShader: BasicVS,
        fragmentShader: EDLPassTwoFS,
    });
}

PBRRRenderer.prototype._createRenderTargets = function _createRenderTargets(view) {
    const scale = 1;// 0.75;
    this.renderTargets[RT.COLOR_AND_DEPTH] = new THREE.WebGLRenderTarget(scale * view.camera.width, scale * view.camera.height);
    this.renderTargets[RT.COLOR_AND_DEPTH].texture.minFilter = THREE.LinearFilter;
    this.renderTargets[RT.COLOR_AND_DEPTH].texture.generateMipmaps = false;
    this.renderTargets[RT.COLOR_AND_DEPTH].depthBuffer = true;
    this.renderTargets[RT.COLOR_AND_DEPTH].texture.format = THREE.RGBAFormat;
    this.renderTargets[RT.COLOR_AND_DEPTH].texture.minFilter = THREE.NearestFilter;
    this.renderTargets[RT.COLOR_AND_DEPTH].texture.magFilter = THREE.NearestFilter;
    this.renderTargets[RT.COLOR_AND_DEPTH].depthTexture = new THREE.DepthTexture();
    this.renderTargets[RT.COLOR_AND_DEPTH].depthTexture.type = THREE.UnsignedShortType;

    this.renderTargets[RT.PASS_TWO_PING] = new THREE.WebGLRenderTarget(scale * view.camera.width, scale * view.camera.height);
    this.renderTargets[RT.PASS_TWO_PING].texture.minFilter = THREE.LinearFilter;
    this.renderTargets[RT.PASS_TWO_PING].texture.generateMipmaps = false;
    this.renderTargets[RT.PASS_TWO_PING].depthBuffer = true;
    this.renderTargets[RT.PASS_TWO_PING].texture.format = THREE.RGBAFormat;
    this.renderTargets[RT.PASS_TWO_PING].texture.minFilter = THREE.NearestFilter;
    this.renderTargets[RT.PASS_TWO_PING].texture.magFilter = THREE.NearestFilter;
    this.renderTargets[RT.PASS_TWO_PING].depthTexture = new THREE.DepthTexture();
    this.renderTargets[RT.PASS_TWO_PING].depthTexture.type = THREE.UnsignedShortType;

    this.renderTargets[RT.PASS_TWO_PONG] = new THREE.WebGLRenderTarget(scale * view.camera.width, scale * view.camera.height);
    this.renderTargets[RT.PASS_TWO_PONG].texture.minFilter = THREE.LinearFilter;
    this.renderTargets[RT.PASS_TWO_PONG].texture.generateMipmaps = false;
    this.renderTargets[RT.PASS_TWO_PONG].depthBuffer = true;
    this.renderTargets[RT.PASS_TWO_PONG].texture.format = THREE.RGBAFormat;
    this.renderTargets[RT.PASS_TWO_PONG].texture.minFilter = THREE.NearestFilter;
    this.renderTargets[RT.PASS_TWO_PONG].texture.magFilter = THREE.NearestFilter;
    this.renderTargets[RT.PASS_TWO_PONG].depthTexture = new THREE.DepthTexture();
    this.renderTargets[RT.PASS_TWO_PONG].depthTexture.type = THREE.UnsignedShortType;
};

PBRRRenderer.prototype.renderView = function renderView(view) {
    const g = view.mainLoop.gfxEngine;
    const r = g.renderer;

    // render to target
    if (!this.controlParameters.visibility) {
        view._layers[0].pointSize = undefined;
        r.setRenderTarget();
        r.clear();
        r.setViewport(0, 0, g.getWindowSize().x, g.getWindowSize().y);
        r.render(
            view.scene,
            view.camera.camera3D);
        return;
    }
    view._layers[0].pointSize = 0;

    r.setRenderTarget(this.renderTargets[RT.COLOR_AND_DEPTH]);
    r.clearTarget(this.renderTargets[RT.COLOR_AND_DEPTH], true, true, false);
    r.setViewport(0, 0, this.renderTargets[RT.COLOR_AND_DEPTH].width, this.renderTargets[RT.COLOR_AND_DEPTH].height);
    r.render(
        view.scene,
        view.camera.camera3D,
        this.renderTargets[RT.COLOR_AND_DEPTH]);

    const n = view.camera.camera3D.near;
    const f = view.camera.camera3D.far;
    const m43 = -(2 * f * n) / (f - n);
    const m33 = -(f + n) / (f - n);

    const mat = new THREE.Matrix4();
    mat.getInverse(view.camera.camera3D.projectionMatrix);

    // compute rays
    const temp = new THREE.Vector4();
    for (let i = 0; i < 4; i++) {
        temp.x = this.quad.geometry.attributes.position.array[3 * i];
        temp.y = this.quad.geometry.attributes.position.array[3 * i + 1];
        temp.z = 0;
        temp.w = 1;

        temp.applyMatrix4(mat);
        temp.divideScalar(temp.w);
        temp.divideScalar(temp.z);

        const m = new THREE.Matrix4();
        view.camera.camera3D.matrixWorld.extractRotation(m);
        // temp.applyMatrix4(m);

        this.quad.geometry.getAttribute('ray').setXYZ(i,
            temp.x, temp.y, temp.z);
    }

    this.quad.material = this.passOne;
    this.quad.material.uniforms.colorTexture.value = this.renderTargets[RT.COLOR_AND_DEPTH].texture;
    this.quad.material.uniforms.depthTexture.value = this.renderTargets[RT.COLOR_AND_DEPTH].depthTexture;
    this.quad.material.uniforms.resolution.value.set(this.renderTargets[RT.COLOR_AND_DEPTH].width, this.renderTargets[RT.COLOR_AND_DEPTH].height);
    this.quad.material.uniforms.m43.value = m43;
    this.quad.material.uniforms.m33.value = m33;
    this.quad.material.uniforms.threshold.value = this.controlParameters.threshold;
    this.quad.material.uniforms.showRemoved.value = this.controlParameters.showRemoved;
    this.quad.material.uniforms.invPersMatrix.value.getInverse(view.camera.camera3D.projectionMatrix);

    this.quad.material.uniforms.near.value = n;
    this.quad.material.uniforms.far.value = f;
    // const T = n * tan(0.5 * THREE.Math.degToRad(view.camera.camera3D.fov));
    // const R = view.camera.camera3D.aspect * T;
    // this.quad.material.uniforms.rightTop.value.set(R, T);

    // Write to PASS_TWO_PING
    if (this.controlParameters.fill_steps == 0) {
        r.setRenderTarget();
        r.clear();
        r.setViewport(0, 0, g.getWindowSize().x, g.getWindowSize().y);
        r.render(this.edlScene, this.edlCam);
        return;
    }

    r.setRenderTarget(this.renderTargets[RT.PASS_TWO_PING]);
    r.clearTarget(this.renderTargets[RT.PASS_TWO_PING], true, true, false);
    r.setViewport(0, 0, this.renderTargets[RT.PASS_TWO_PING].width, this.renderTargets[RT.PASS_TWO_PING].height);
    r.render(this.edlScene, this.edlCam, this.renderTargets[RT.PASS_TWO_PING]);

    let outRT;
    for (let i = 0; i < this.controlParameters.fill_steps; i++) {
        const inRT = RT.PASS_TWO_PING + i % 2;
        outRT = RT.PASS_TWO_PING + (i + 1) % 2;

        // Read from PASS_TWO_PING
        this.quad.material = this.passTwo;
        this.quad.material.uniforms.colorTexture.value = this.renderTargets[inRT].texture;
        this.quad.material.uniforms.depthTexture.value = this.renderTargets[inRT].depthTexture;
        this.quad.material.uniforms.resolution.value.set(this.renderTargets[inRT].width, this.renderTargets[inRT].height);
        this.quad.material.uniforms.depth_contrib.value = this.controlParameters.depth_contrib;

        // Write to PASS_TWO_PONG
        r.setViewport(0, 0, this.renderTargets[outRT].width, this.renderTargets[outRT].height);
        r.setRenderTarget(this.renderTargets[outRT]);
        r.clearTarget(this.renderTargets[outRT], true, true, false);
        r.render(this.edlScene, this.edlCam, this.renderTargets[outRT]);
    }

    this.quad.material = this.edlMaterial;
    this.quad.material.uniforms.depthTexture.value = this.renderTargets[outRT].depthTexture;
    // this.quad.material.uniforms.depthTextureHalfRes.value = this.renderTargets[RT.DEPTH_BUFFER_HALF_RES].texture;
    // this.quad.material.uniforms.depthTextureQuarterRes.value = this.renderTargets[RT.DEPTH_BUFFER_QUARTER_RES].texture;
    this.quad.material.uniforms.resolution.value.set(this.renderTargets[outRT].width, this.renderTargets[outRT].height);
    this.quad.material.uniforms.cameraNear.value = view.camera.camera3D.near;
    this.quad.material.uniforms.cameraFar.value = view.camera.camera3D.far;
    // this.quad.material.uniforms.radius.value = this.controlParameters.radius;
    // this.quad.material.uniforms.strength.value = this.controlParameters.strength;
    // this.quad.material.uniforms.directions.value = this.controlParameters.directions;
    // this.quad.material.uniforms.n.value = this.controlParameters.n;
    // this.quad.material.uniforms.subsample.value = fallse;:this.controlParameters.subsample;

    const dest = (outRT == RT.PASS_TWO_PING) ? RT.PASS_TWO_PONG : RT.PASS_TWO_PING;

    r.setRenderTarget(this.renderTargets[dest]);
    r.clear();
    r.setViewport(0, 0, this.renderTargets[dest].width, this.renderTargets[dest].height);
    r.render(
        this.edlScene,
        this.edlCam,
        this.renderTargets[dest]);

    // combine ...
    this.quad.material = this.composeMaterial;
    this.quad.material.uniforms.textureColor.value = this.renderTargets[outRT].texture;
    this.quad.material.uniforms.textureEDL.value = this.renderTargets[dest].texture;
    r.setRenderTarget();
    r.clear();
    r.setViewport(0, 0, g.getWindowSize().x, g.getWindowSize().y);
    r.render(
        this.edlScene,
        this.edlCam);
};

export default PBRRRenderer;
