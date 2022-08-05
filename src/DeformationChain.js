import {
    Color,
    BufferGeometry,
    BufferAttribute,
    Points, Line,
    LineDashedMaterial,
    Mesh,
    LineLoop,
    Matrix4,
    Vector2,
    Vector3,
    Box2,
    Group,
    Line3,
} from 'three';

import PointsMaterial from './Renderer/PointsMaterial.js';

// create empty point
function createPoint(color) {
    const cc = new Color(color);
    return function _createPoint() {
        const p = Float32Array.of(0, 0, 0);
        const c = Uint8Array.of(cc.r * 255, cc.g * 255, cc.b * 255, 255);
        const g = new BufferGeometry();

        g.setAttribute('position', new BufferAttribute(p, 3));
        g.setAttribute('color', new BufferAttribute(c, 4, true));

        const m = new PointsMaterial(5);
        m.depthTest = false;

        const pt = new Points(g, m);
        pt.frustumCulled = false;
        pt.material.transparent = true;

        return pt;
    };
}

function createDashedLine() {
    const vertices = new Float32Array([
        0, 0, 0,
        0, 0, 0,
    ]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(vertices, 3));

    const dashedLine = new Line(
        geometry,
        new LineDashedMaterial({ dashSize: 0.5, gapSize: 0.5 }),
    );
    dashedLine.material.depthTest = false;
    dashedLine.frustumCulled = false;
    dashedLine.material.linewidth = 2;
    return dashedLine;
}

function createLine() {
    const vertices = new Float32Array([
        0, 0, 0,
        0, 0, 0,
    ]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(vertices, 3));

    const dashedLine = new Line(geometry);
    dashedLine.material.depthTest = false;
    dashedLine.material.linewidth = 2;
    dashedLine.material.transparent = true;
    dashedLine.frustumCulled = false;
    return dashedLine;
}

function createRectangle() {
    const vertices = new Float32Array([
        0.5, 1, 0,
        -0.5, 1, 0,
        -0.5, -1, 0,
        0.5, -1, 0,
    ]);
    const indices = [
        0, 1, 2,
        2, 3, 0,
    ];
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(vertices, 3));
    geometry.setIndex(indices);

    const rect = new Mesh(geometry);
    rect.material.transparent = true;
    rect.material.opacity = 0.1;
    rect.material.transparent = true;
    rect.frustumCulled = false;

    // add line
    const outline = new LineLoop(geometry);
    outline.material.color = new Color(0xff0000);
    outline.frustumCulled = false;
    rect.add(outline);

    return rect;
}

function angleFromLine(l) {
    const diff = l.delta();
    return Math.atan2(diff.y, diff.x);
}

function computeTransformation(originalLine, modifiedLine, scale, camera3D) {
    // Compute matrix
    const m1 = new Matrix4().makeTranslation(
        -originalLine.getCenter().x, -originalLine.getCenter().y, 0,
    );

    const angle1 = angleFromLine(originalLine);
    const angle2 = angleFromLine(modifiedLine);

    const m2 = new Matrix4().makeRotationZ(
        -angle1,
    );

    const s = modifiedLine.distance() / originalLine.distance();
    const m3 = new Matrix4().makeScale(s, 1.0, 1.0);

    const m4 = new Matrix4().makeRotationZ(
        angle2,
    );

    const m5 = new Matrix4().makeTranslation(
        modifiedLine.getCenter().x, modifiedLine.getCenter().y, 0.0,
    );

    // to avoid precision issue in the shader, we must premultiply here
    if (camera3D) {
        m5.premultiply(camera3D.matrixWorldInverse);
    }

    // Compute Box2 containing the original segment
    const vec = originalLine.delta().normalize();
    const length = originalLine.distance();
    const transfoBox = new Box2();
    // TODO there *must be* a better way (check if getCenter creates an instance)
    transfoBox.expandByPoint(
        originalLine.getCenter().add(vec.clone().multiplyScalar(length * scale.x * -0.5)),
    );
    transfoBox.expandByPoint(
        originalLine.getCenter().add(vec.clone().multiplyScalar(length * scale.x * 0.5)),
    );

    const normal = new Vector2(-vec.y, vec.x);
    const scaleVec = normal.multiplyScalar(scale.y);
    transfoBox.min.x -= Math.abs(scaleVec.x);
    transfoBox.max.x += Math.abs(scaleVec.x);
    transfoBox.min.y -= Math.abs(scaleVec.y);
    transfoBox.max.y += Math.abs(scaleVec.y);

    return {
        vec,
        length,
        v1: originalLine.start,
        v2: originalLine.end,
        influence: scale,
        box: transfoBox,
        matrix: m5.multiply(m4.multiply(m3.multiply(m2.multiply(m1)))),
    };
}

class Catalog {
    constructor(buildElement, parent) {
        this.build = buildElement;
        this.reserve = [];
        this.parent = new Group();
        parent.add(this.parent);
        this.used = 0;
    }

    reset() {
        for (let i = 0; i < this.used; i++) {
            this.reserve[i].visible = false;
        }
        this.used = 0;
    }

    get() {
        if (this.reserve.length <= this.used) {
            this.reserve.push(this.build());
            if (this.parent) {
                this.parent.add(this.reserve[this.used]);
            }
        }
        const result = this.reserve[this.used++];
        result.visible = true;
        return result;
    }
}

class DeformationChain {
    constructor(group) {
        this.greenPoint = createPoint('green')();
        this.greenPoint.material.uniforms.size.value = 12;
        group.add(this.greenPoint);
        this.redPoints = new Catalog(createPoint('red'), group);
        this.yellowPoints = new Catalog(createPoint('yellow'), group);
        this.dashedLines = new Catalog(createDashedLine, group);
        this.modifiedLines = new Catalog(createLine, group);
        this.rectangles = new Catalog(createRectangle, group);

        this.chains = [];
        this.active = {
            chain: -1,
            point: -1,
        };
    }

    _activeChain() {
        return this.chains[this.active.chain];
    }

    newChain(pt) {
        this.chains.push([]);
        this.active.chain = this.chains.length - 1;
        this.active.point = -1;

        if (pt) {
            this.addPoint(pt);
        }
    }

    updateScale(rectLink, changeX, changeY) {
        const { scale } = this.chains[rectLink.k][rectLink.i];
        scale.x = Math.max(1, scale.x + changeX);
        scale.y = Math.max(0.5, scale.y + changeY);
    }

    addPoint(pt) {
        if (this.chains.length === 0) {
            this.newChain();
        }
        let color;
        if (this.active.point <= 0 || this.active.point === (this._activeChain().length - 1)) {
            // active point is either the first or the last
            if (this.active.point === 0) {
                // we must keep the same color
                color = this._activeChain()[this.active.point].color;
                this.active.point = -1;
            }
        } else {
            // no support for branch -> new chain
            this.newChain(this._activeChain()[this.active.point]);
        }
        color = color || new Color(
            Math.random(), Math.random(), Math.random(),
        );

        if (pt.isVector3) {
            this._activeChain().splice(
                this.active.point + 1,
                0,
                {
                    color,
                    original: pt.clone().setZ(0),
                    modified: pt.clone().setZ(0),
                    scale: new Vector3(1, 3, 1),
                },
            );
        } else {
            this._activeChain().splice(
                this.active.point + 1,
                0,
                {
                    color,
                    original: pt.original,
                    modified: pt.modified,
                    scale: new Vector3(1, 3, 1),
                },
            );
        }

        this.active.point += 1;
        this.updateVisualRepresentation();
    }

    getYellowPoints() {
        return this.yellowPoints.reserve
            .slice(0, this.yellowPoints.reserve.used);
    }

    getRedPoints() {
        return this.redPoints.reserve
            .slice(0, this.redPoints.reserve.used);
    }

    getInfluences() {
        return this.rectangles.reserve
            .slice(0, this.rectangles.reserve.used);
    }

    updateVisualRepresentation(instance) {
        this.redPoints.reset();
        this.yellowPoints.reset();
        this.dashedLines.reset();
        this.modifiedLines.reset();
        this.rectangles.reset();

        this.greenPoint.visible = false;
        const TTT = this.computeTransformations();
        for (let k = 0; k < this.chains.length; k++) {
            const chain = this.chains[k];

            if (this.active.chain === k && this.active.point >= chain.length) {
                this.active.point--;
            }

            // draw 2 points per element in the chain:
            //   - 1 red for the original point
            //   - 1 yellow for the modified
            // and a white dashed lines connecting both
            for (let i = 0; i < chain.length; i++) {
                const elt = chain[i];

                // red point
                const red = this.redPoints.get();
                red.position.copy(elt.original);
                red.updateMatrixWorld(true);
                red.onSelect = () => {
                    this.active.chain = k;
                    this.active.point = i;
                    instance.notifyChange(true);
                };
                red.onDelete = () => {
                    const deleted = chain.splice(i, 1);
                    // browse other chains and delete similar points
                    for (let t = 0; t < this.chains.length; t++) {
                        const ch = this.chains[t];
                        for (let u = 0; u < ch.length; u++) {
                            if (ch[u].original === deleted[0].original) {
                                ch.splice(u, 1);
                                break;
                            }
                        }
                    }
                    instance.notifyChange(true);
                };
                if (this.active.chain === k && this.active.point === i) {
                    this.greenPoint.visible = true;
                    this.greenPoint.position.copy(red.position);
                    this.greenPoint.updateMatrixWorld(true);
                }

                // yellow point
                const yellow = this.yellowPoints.get();
                yellow.position.copy(elt.modified);
                yellow.updateMatrixWorld(true);
                yellow.onDrag = (newPosition, end) => {
                    if (end) {
                        elt.highlight = undefined;
                    } else {
                        // highlight influence areas
                        elt.modified.x = newPosition.x;
                        elt.modified.y = newPosition.y;
                        elt.highlight = 'both';
                    }
                };
            }

            if (chain.length >= 2) {
                for (let i = 0; i < chain.length - 1; i++) {
                    const eltA = chain[i];
                    const eltB = chain[i + 1];

                    const line = new Line3(eltA.original, eltB.original);
                    const length = line.distance();

                    // draw a rectangular influence area
                    const rect = this.rectangles.get();
                    for (let j = 0; j < 4; j++) {
                        rect.geometry.vertices[j].x = Math.sign(rect.geometry.vertices[j].x)
                            * length
                            * 0.5;
                    }
                    rect.geometry.computeBoundingSphere();
                    line.getCenter(rect.position);
                    rect.rotation.z = angleFromLine(line);
                    rect.material.color.copy(chain[0].color);
                    rect.geometry.verticesNeedUpdate = true;
                    const highlight = eltA.highlight === 'rect' || eltA.highlight === 'both' || eltB.highlight === 'both';
                    if (highlight) {
                        rect.children[0].material.color = new Color(0xff0000);
                        rect.material.opacity = 0.35;
                    } else {
                        rect.children[0].material.color.copy(chain[0].color);
                        rect.material.opacity = 0.05;
                    }
                    rect.scale.copy(eltA.scale);
                    rect.link = { k, i };
                    rect.updateMatrixWorld(true);

                    rect.onMouseOver = end => {
                        eltA.highlight = end ? undefined : 'rect';
                    };

                    const rect2 = this.rectangles.get();
                    for (let j = 0; j < 4; j++) {
                        rect2.geometry.vertices[j].x = Math.sign(rect2.geometry.vertices[j].x)
                            * length
                            * 0.5;
                    }
                    rect2.geometry.computeBoundingSphere();
                    line.getCenter(rect2.position);
                    rect2.rotation.z = angleFromLine(line);
                    rect2.material.color.copy(chain[0].color);
                    rect2.geometry.verticesNeedUpdate = true;
                    if (highlight) {
                        rect2.children[0].material.color = new Color(0xff0000);
                        rect2.material.opacity = 0.35;
                    } else {
                        rect2.children[0].material.color.copy(chain[0].color);
                        rect2.material.opacity = 0.05;
                    }
                    rect2.scale.copy(eltA.scale);
                    rect2.link = { k, i };
                    rect2.updateMatrixWorld(true);
                    rect2.matrixWorld.premultiply(TTT[k][i].matrix);
                    rect2.onMouseOver = end => {
                        eltA.highlight = end ? undefined : 'rect';
                    };

                    if (highlight) {
                        // dashed line
                        for (let o = 0; o < 4; o++) {
                            const dashed = this.dashedLines.get();
                            dashed.position.copy(
                                rect.geometry.vertices[o].clone().applyMatrix4(rect.matrixWorld),
                            );
                            dashed.geometry.vertices[1] = rect2.geometry.vertices[o]
                                .clone()
                                .applyMatrix4(rect2.matrixWorld)
                                .sub(dashed.position);
                            dashed.computeLineDistances();
                            dashed.geometry.verticesNeedUpdate = true;
                            dashed.geometry.lineDistancesNeedUpdate = true;
                            if (o === 0 || o === 3) {
                                // line from eltB side
                                if (eltB.highlight === 'both') {
                                    dashed.material.color = new Color(0x881111);
                                } else if (eltA.highlight === 'both') {
                                    dashed.material.color = new Color(0xffcccc);
                                } else if (eltA.highlight === 'rect') {
                                    dashed.material.color = new Color(0xffcccc);
                                } else {
                                    dashed.visible = false;
                                }
                            } else if (o) {
                                // line from eltA side
                                if (eltA.highlight === 'both') {
                                    dashed.material.color = new Color(0x111188);
                                } else if (eltB.highlight === 'both') {
                                    dashed.material.color = new Color(0xccccff);
                                } else if (eltA.highlight === 'rect') {
                                    dashed.material.color = new Color(0xccccff);
                                } else {
                                    dashed.visible = false;
                                }
                            }
                            dashed.updateMatrixWorld(true);
                        }
                    }
                }
            }
        }
    }

    computeTransformations(camera3D) {
        const transformations = [];
        for (let k = 0; k < this.chains.length; k++) {
            const chain = this.chains[k];

            const result = [];
            for (let i = 0; i < chain.length - 1; i++) {
                const eltA = chain[i];
                const eltB = chain[i + 1];

                const originalLine = new Line3(eltA.original, eltB.original);
                const modifiedLine = new Line3(eltA.modified, eltB.modified);

                const transfo = computeTransformation(
                    originalLine, modifiedLine,
                    eltA.scale,
                    camera3D,
                );
                transfo.color = chain[0].color;

                result.push(transfo);
            }
            transformations.push(result);
        }
        return transformations;
    }

    export() {
        return JSON.stringify(this.computeTransformations());
    }

    import(json) {
        this.chains = [];
        this.active = {
            chain: -1,
            point: -1,
        };

        for (const chain of json) {
            this.newChain();
            for (let i = 0; i < chain.length; i++) {
                const segment = chain[i];

                const v1 = new Vector3(segment.v1.x, segment.v1.y, segment.v1.z);
                this.addPoint(v1);

                // load matrix
                const m = new Matrix4();
                m.elements = segment.matrix.elements;

                this._activeChain()[this.active.point].modified = v1.clone().applyMatrix4(m);
                this._activeChain()[this.active.point].scale = new Vector3(
                    segment.influence.x, segment.influence.y, 1,
                );

                if (i === chain.length - 1) {
                    const v2 = new Vector3(segment.v2.x, segment.v2.y, segment.v2.z);
                    this.addPoint(v2);

                    this._activeChain()[this.active.point].modified = v2.clone().applyMatrix4(m);
                    this._activeChain()[this.active.point].scale = new Vector3(
                        segment.influence.x, segment.influence.y, 1,
                    );
                }
            }
            this._activeChain().reverse();
        }
    }
}

export default DeformationChain;
