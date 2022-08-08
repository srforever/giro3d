import {
    Vector2,
    Texture,
    LinearFilter,
    RGBFormat,
    DataTexture,
} from 'three';

const pt = new Vector2();

function _moveTo(ctx, coord, scale, origin) {
    pt.x = coord._values[0] - origin.x;
    // canvas y axis is top to bottom
    pt.y = origin.y - coord._values[1];
    pt.multiply(scale);
    ctx.moveTo(pt.x, pt.y);
}

function _lineTo(ctx, coord, scale, origin) {
    pt.x = coord._values[0] - origin.x;
    // canvas y axis is top to bottom
    pt.y = origin.y - coord._values[1];
    pt.multiply(scale);
    ctx.lineTo(pt.x, pt.y);
}

function drawPolygon(ctx, vertices, indices, origin, scale, properties, style = {}) {
    if (vertices.length === 0) {
        return;
    }

    if (style.length) {
        for (const s of style) {
            _drawPolygon(ctx, vertices, indices, origin, scale, properties, s);
        }
    } else {
        _drawPolygon(ctx, vertices, indices, origin, scale, properties, style);
    }
}

function _drawPolygon(ctx, vertices, indices, origin, scale, properties, style) {
    // build contour
    ctx.beginPath();
    for (const indice of indices) {
        _moveTo(ctx, vertices[indice.offset], scale, origin);
        for (let j = 1; j < indice.count; j++) {
            _lineTo(ctx, vertices[indice.offset + j], scale, origin);
        }
    }

    // draw line polygon
    if (style.stroke || properties.stroke) {
        ctx.strokeStyle = style.stroke || properties.stroke;
        ctx.lineWidth = style.strokeWidth || properties['stroke-width'] || 2.0;
        ctx.globalAlpha = style.strokeOpacity || properties['stroke-opacity'] || 1.0;
        ctx.lineCap = style.strokeCap || properties['stroke-cap'] || 'butt';
        ctx.stroke();
    }

    // fill polygon
    if (indices && (style.fill || properties.fill)) {
        ctx.fillStyle = style.fill || properties.fill;
        ctx.globalAlpha = style.fillOpacity || properties['fill-opacity'] || 1.0;
        ctx.fill();
    }
}

function drawPoint(ctx, vertice, origin, scale, style = {}) {
    pt.x = vertice._values[0] - origin.x;
    // canvas y axes is top to bottom
    pt.y = origin.y - vertice._values[1];
    pt.multiply(scale);

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, style.radius || 3, 0, 2 * Math.PI, false);
    ctx.fillStyle = style.fill || 'white';
    ctx.fill();
    ctx.lineWidth = style.lineWidth || 1.0;
    ctx.strokeStyle = style.stroke || 'red';
    ctx.stroke();
}

function drawFeature(ctx, feature, origin, scale, extent, style = {}) {
    const { properties } = feature;

    if (typeof (style) === 'function') {
        style = style(properties, feature);
    }

    for (const geometry of feature.geometry) {
        if (feature.type === 'point') {
            drawPoint(ctx, feature.vertices[0], origin, scale, style);
        } else if (geometry.extent.intersectsExtent(extent)) {
            drawPolygon(ctx, feature.vertices, geometry.indices, origin, scale, properties, style);
        }
    }
}

export default {
    // backgroundColor is a Color to specify a color to fill the texture
    // with, given there is no feature passed in parameter
    createTextureFromFeature(collection, extent, sizeTexture, style, backgroundColor) {
        let texture;

        if (collection) {
            // A texture is instancied drawn canvas origin and dimension are used to transform the
            // feature's coordinates to canvas's space
            // NOTE: canvas y axes is top to bottom
            const origin = new Vector2(extent.west(), extent.north());
            const dimension = extent.dimensions();
            const c = document.createElement('canvas');

            c.width = sizeTexture;
            c.height = sizeTexture;
            const ctx = c.getContext('2d');
            if (backgroundColor) {
                ctx.fillStyle = backgroundColor.getStyle();
                ctx.fillRect(0, 0, sizeTexture, sizeTexture);
            }
            ctx.globalCompositeOperation = style.globalCompositeOperation || 'source-over';

            const scale = new Vector2(
                ctx.canvas.width / dimension.x, ctx.canvas.width / dimension.y,
            );

            // Draw the canvas
            for (const feature of collection.features) {
                drawFeature(ctx, feature, origin, scale, extent, style);
            }

            texture = new Texture(c);
            texture.flipY = false;
            texture.generateMipmaps = false;
            texture.magFilter = LinearFilter;
            texture.minFilter = LinearFilter;
            texture.needsUpdate = true;
        } else if (backgroundColor) {
            const data = new Uint8Array(3);
            data[0] = backgroundColor.r * 255;
            data[1] = backgroundColor.g * 255;
            data[2] = backgroundColor.b * 255;
            texture = new DataTexture(data, 1, 1, RGBFormat);
            texture.needsUpdate = true;
        } else {
            texture = new Texture();
        }

        return texture;
    },
    featuresAtPoint(collection, extent, sizeTexture, style, point, radius) {
        if (!collection) {
            return [];
        }
        const results = [];

        // We can only calculate the scale from the full tile
        const dimension = extent.dimensions();
        const scale = new Vector2(sizeTexture / dimension.x, sizeTexture / dimension.y);

        // A texture is instancied drawn canvas
        // origin and dimension are used to transform the feature's coordinates to canvas's space
        // NOTE: canvas y axes is top to bottom
        const origin = new Vector2(point.x - radius / scale.x, point.y + radius / scale.y);

        const c = document.createElement('canvas');

        c.width = 1 + radius * 2;
        c.height = 1 + radius * 2;
        const ctx = c.getContext('2d');
        ctx.globalCompositeOperation = 'source-over';

        // Draw the canvas
        for (const feature of collection.features) {
            ctx.clearRect(0, 0, c.width, c.height);
            drawFeature(ctx, feature, origin, scale, extent, style);
            const imgd = ctx.getImageData(0, 0, c.width, c.height);
            const pix = imgd.data;
            let found = false;
            for (let i = 0; i < imgd.data.length; i += 4) {
                found = found || pix[i + 3] > 0; // for now we only test opacity > 0
                if (found) break;
            }
            if (found) {
                results.push(feature);
            }
        }
        return results;
    },
};
