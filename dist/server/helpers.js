const { sqrt, atan2 } = Math;
/**
 * Extend a source object with the properties of another object (shallow copy).
 * We use this to simulate Node's deprecated `process.mixin`.
 */
export function extend(object, properties) {
    for (const key in properties) {
        if (Object.prototype.hasOwnProperty.call(properties, key)) {
            object[key] = properties[key];
        }
    }
    return object;
}
/**
 * Calculate the distance between two objects.
 */
export function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return sqrt(dx * dx + dy * dy);
}
/**
 * Calculate the heading from `a` towards `b` in radians.
 */
export function heading(a, b) {
    return atan2(b.y - a.y, b.x - a.x);
}
//# sourceMappingURL=helpers.js.map