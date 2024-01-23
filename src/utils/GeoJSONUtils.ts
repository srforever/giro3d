/**
 * Given a simple GeoJSON Geometry object, returns the flat coordinates
 *
 * @param geojson GeoJSON geometry object
 * @returns Flat coordinates
 */
function toFlatCoordinates(geojson: GeoJSON.Geometry): number[] {
    if (geojson.type === 'GeometryCollection') throw new Error(`GeoJSON type '${geojson.type}' is not supported`);
    return geojson.coordinates.flat(3);
}

/**
 * Creates a simple GeoJSON Geometry object from a list of 3D coordinates.
 *
 * @param flat3Coords Coordinates
 * @param geometryType Geometry type
 * @returns GeoJSON geometry object
 */
function fromFlat3Coordinates(
    flat3Coords: [number, number, number][],
    geometryType: GeoJSON.GeoJsonGeometryTypes,
): GeoJSON.Geometry {
    if (geometryType === 'GeometryCollection') throw new Error(`GeoJSON type '${geometryType}' is not supported`);

    switch (geometryType) {
        case 'Point':
            return {
                type: geometryType,
                coordinates: flat3Coords[0],
            };
        case 'LineString':
        case 'MultiPoint':
            return {
                type: geometryType,
                coordinates: flat3Coords,
            };
        case 'Polygon':
        case 'MultiLineString':
            return {
                type: geometryType,
                coordinates: [flat3Coords],
            };
        case 'MultiPolygon':
            return {
                type: geometryType,
                coordinates: [[flat3Coords]],
            };
        default:
            throw new Error(`GeoJSON type '${geometryType}' is not supported`);
    }
}

/**
 * Creates a simple GeoJSON Geometry object from a list of flat coordinates.
 *
 * Prefer `fromFlat3Coordinates` if possible (quicker, no object creation).
 *
 * @param flatCoords Coordinates
 * @param geometryType Geometry type
 * @returns GeoJSON geometry object
 */
function fromFlatCoordinates(
    flatCoords: number[],
    geometryType: GeoJSON.GeoJsonGeometryTypes,
): GeoJSON.Geometry {
    const coords = new Array(flatCoords.length / 3);
    for (let i = 0; i < flatCoords.length / 3; i += 1) {
        coords[i] = [
            flatCoords[i * 3 + 0],
            flatCoords[i * 3 + 1],
            flatCoords[i * 3 + 2],
        ];
    }
    return fromFlat3Coordinates(coords, geometryType);
}

export default {
    toFlatCoordinates,
    fromFlat3Coordinates,
    fromFlatCoordinates,
};
